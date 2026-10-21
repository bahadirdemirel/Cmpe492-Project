import shutil
import tempfile
from io import StringIO
from pathlib import Path

from django.contrib.auth import get_user_model
from django.core.management import call_command
from django.test import TestCase, override_settings
from django.urls import reverse

from .models import Song


class MediaRootMixin:
    def setUp(self):
        self.media_root = Path(tempfile.mkdtemp())
        self.addCleanup(shutil.rmtree, self.media_root, ignore_errors=True)
        override = override_settings(MEDIA_ROOT=self.media_root)
        override.enable()
        self.addCleanup(override.disable)


class TrackListApiTests(MediaRootMixin, TestCase):
    def test_requires_authentication(self):
        response = self.client.get(reverse('track-list'))
        self.assertEqual(response.status_code, 401)

    def test_returns_all_tracks_as_json_list(self):
        Song.objects.create(title='Song B', artist='Zed', file='music/b.mp3')
        Song.objects.create(title='Song A', artist='Abe', file='music/a.mp3')
        self.client.force_login(get_user_model().objects.create_user(username='listener'))

        response = self.client.get(reverse('track-list'))

        self.assertEqual(response.status_code, 200)
        data = response.json()
        self.assertEqual([t['title'] for t in data], ['Song A', 'Song B'])
        # Audio must not be reachable without paying
        self.assertEqual(set(data[0]), {'id', 'title', 'artist'})
        self.assertEqual(self.client.get('/media/music/a.mp3').status_code, 404)


class SyncMusicCommandTests(MediaRootMixin, TestCase):
    def drop(self, name):
        path = self.media_root / 'music' / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(b'not really audio')

    def sync(self, *args):
        call_command('sync_music', *args, stdout=StringIO())

    def test_registers_new_files_using_filename_fallback(self):
        self.drop('Daft Punk - One More Time.mp3')
        self.drop('untagged.wav')
        self.drop('cover.jpg')

        self.sync()

        songs = {s.file.name: s for s in Song.objects.all()}
        self.assertEqual(set(songs), {'music/Daft Punk - One More Time.mp3', 'music/untagged.wav'})
        self.assertEqual(songs['music/Daft Punk - One More Time.mp3'].artist, 'Daft Punk')
        self.assertEqual(songs['music/Daft Punk - One More Time.mp3'].title, 'One More Time')
        self.assertEqual(songs['music/untagged.wav'].title, 'untagged')

    def test_is_idempotent_and_prunes_missing_files(self):
        self.drop('a.mp3')
        self.sync()
        self.sync()
        self.assertEqual(Song.objects.count(), 1)

        (self.media_root / 'music' / 'a.mp3').unlink()
        self.sync('--prune')
        self.assertEqual(Song.objects.count(), 0)
