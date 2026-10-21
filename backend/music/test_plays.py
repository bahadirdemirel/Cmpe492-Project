from unittest import mock

from django.contrib.auth import get_user_model
from django.core import signing
from django.test import TestCase, override_settings
from django.urls import reverse
from rest_framework.test import APIClient

from .chain import PLAY_PRICE, SONG_PLAYED_TOPIC, ChainError
from .models import Play, Song
from .tests import MediaRootMixin
from .views import STREAM_SALT

CONTRACT = '0x5FbDB2315678afecb367f032d93F642f64180aa3'
LISTENER = '0x70997970c51812dc3a010c7d01b50e0d17dc79c8'
TX_HASH = '0x' + 'ab' * 32


def word(value):
    """Left-pad an int or hex string to a 32-byte hex topic."""
    if isinstance(value, int):
        return '0x' + format(value, '064x')
    return '0x' + value[2:].rjust(64, '0')


def receipt(play_id, song_id, price=PLAY_PRICE, status='0x1', address=CONTRACT):
    return {
        'status': status,
        'logs': [
            {  # the Transfer(listener -> 0x0) emitted by _burn, which must be ignored
                'address': address,
                'topics': ['0xddf252ad' + '0' * 56, word(LISTENER), word(0)],
                'data': word(price),
            },
            {
                'address': address,
                'topics': [SONG_PLAYED_TOPIC, word(LISTENER), word(song_id), play_id],
                'data': word(price),
            },
        ],
    }


@override_settings(JUKECOIN_ADDRESS=CONTRACT)
class PlayFlowTests(MediaRootMixin, TestCase):
    def setUp(self):
        super().setUp()
        music = self.media_root / 'music'
        music.mkdir()
        (music / 'song.mp3').write_bytes(b'ID3 fake audio')
        self.song = Song.objects.create(title='Song', artist='Artist', file='music/song.mp3')
        self.other_song = Song.objects.create(title='Other', file='music/other.mp3')

        self.user = get_user_model().objects.create_user(username='listener')
        self.client = APIClient()
        self.client.force_authenticate(self.user)

    def start_play(self, song=None):
        response = self.client.post(reverse('play-create', args=[(song or self.song).pk]))
        self.assertEqual(response.status_code, 201)
        return response.json()

    def confirm(self, play, rpc_result, tx_hash=TX_HASH):
        with mock.patch('music.chain.rpc', return_value=rpc_result):
            return self.client.post(
                reverse('play-confirm', args=[play['id']]), {'tx_hash': tx_hash}, format='json'
            )

    def test_full_flow_pays_then_streams(self):
        play = self.start_play()
        self.assertRegex(play['play_id'], r'^0x[0-9a-f]{64}$')

        response = self.confirm(play, receipt(play['play_id'], self.song.pk))
        self.assertEqual(response.status_code, 200)

        saved = Play.objects.get(pk=play['id'])
        self.assertIsNotNone(saved.paid_at)
        self.assertEqual(saved.listener_address, LISTENER)

        stream = APIClient().get(response.json()['stream_url'])  # no auth: the token is the credential
        self.assertEqual(stream.status_code, 200)
        self.assertEqual(stream['Content-Type'], 'audio/mpeg')
        self.assertEqual(b''.join(stream.streaming_content), b'ID3 fake audio')

    def test_play_cannot_be_confirmed_twice(self):
        play = self.start_play()
        self.confirm(play, receipt(play['play_id'], self.song.pk))
        again = self.confirm(play, receipt(play['play_id'], self.song.pk))
        self.assertEqual(again.status_code, 409)

    def test_transaction_cannot_pay_for_two_plays(self):
        first, second = self.start_play(), self.start_play()
        self.confirm(first, receipt(first['play_id'], self.song.pk))
        reused = self.confirm(second, receipt(first['play_id'], self.song.pk))
        self.assertEqual(reused.status_code, 409)

    def test_rejects_payments_that_do_not_match(self):
        play = self.start_play()
        cases = {
            'other play': receipt(word('0x1234'), self.song.pk),
            'other song': receipt(play['play_id'], self.other_song.pk),
            'too cheap': receipt(play['play_id'], self.song.pk, price=PLAY_PRICE - 1),
            'reverted': receipt(play['play_id'], self.song.pk, status='0x0'),
            'other contract': receipt(play['play_id'], self.song.pk, address='0x' + '11' * 20),
            'not mined': None,
        }
        for name, rpc_result in cases.items():
            with self.subTest(name):
                self.assertEqual(self.confirm(play, rpc_result).status_code, 400)
        self.assertIsNone(Play.objects.get(pk=play['id']).paid_at)

    def test_reports_unreachable_node(self):
        play = self.start_play()
        with mock.patch('music.chain.rpc', side_effect=ChainError('down')):
            response = self.client.post(
                reverse('play-confirm', args=[play['id']]), {'tx_hash': TX_HASH}, format='json'
            )
        self.assertEqual(response.status_code, 502)

    def test_only_the_owner_can_confirm(self):
        play = self.start_play()
        intruder = APIClient()
        intruder.force_authenticate(get_user_model().objects.create_user(username='intruder'))
        with mock.patch('music.chain.rpc', return_value=receipt(play['play_id'], self.song.pk)):
            response = intruder.post(
                reverse('play-confirm', args=[play['id']]), {'tx_hash': TX_HASH}, format='json'
            )
        self.assertEqual(response.status_code, 404)

    def test_stream_rejects_bad_or_unpaid_tokens(self):
        play = self.start_play()
        url = reverse('play-stream', args=[play['id']])
        anon = APIClient()

        self.assertEqual(anon.get(url).status_code, 403)
        self.assertEqual(anon.get(url, {'token': 'forged'}).status_code, 403)
        unpaid = signing.dumps(play['id'], salt=STREAM_SALT)
        self.assertEqual(anon.get(url, {'token': unpaid}).status_code, 404)
        other = signing.dumps(play['id'] + 1, salt=STREAM_SALT)
        self.assertEqual(anon.get(url, {'token': other}).status_code, 403)

    def test_stream_link_expires(self):
        play = self.start_play()
        stream_url = self.confirm(play, receipt(play['play_id'], self.song.pk)).json()['stream_url']
        with mock.patch('music.views.STREAM_TOKEN_MAX_AGE', -1):
            self.assertEqual(APIClient().get(stream_url).status_code, 403)

    @override_settings(JUKECOIN_ADDRESS='')
    def test_reports_missing_contract_configuration(self):
        response = self.client.post(reverse('play-create', args=[self.song.pk]))
        self.assertEqual(response.status_code, 503)
