import mimetypes
import re

from django.conf import settings
from django.core import signing
from django.db import IntegrityError
from django.http import FileResponse, Http404, HttpResponseForbidden
from django.shortcuts import get_object_or_404
from django.urls import reverse
from django.utils import timezone
from django.views.decorators.http import require_GET
from rest_framework import generics, status
from rest_framework.response import Response
from rest_framework.views import APIView

from .chain import ChainError, PaymentError, verify_play_payment
from .models import Play, Song
from .serializers import PlaySerializer, SongSerializer

TX_HASH_RE = re.compile(r'^0x[0-9a-f]{64}$')
STREAM_SALT = 'music.play-stream'
# A stream link is only handed out after payment and only works briefly, so one payment buys one listen.
STREAM_TOKEN_MAX_AGE = 10 * 60


class SongListView(generics.ListAPIView):
    queryset = Song.objects.all()
    serializer_class = SongSerializer


class PlayCreateView(APIView):
    """Step 1: reserve a play and get the play_id to pass to JukeCoin.payForPlay."""

    def post(self, request, pk):
        if not settings.JUKECOIN_ADDRESS:
            return Response(
                {'detail': 'Payments are not configured on the server (JUKECOIN_ADDRESS is empty).'},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        song = get_object_or_404(Song, pk=pk)
        play = Play.objects.create(user=request.user, song=song)
        return Response(PlaySerializer(play).data, status=status.HTTP_201_CREATED)


class PlayConfirmView(APIView):
    """Step 2: verify the payment transaction on-chain and return a short-lived stream URL."""

    def post(self, request, pk):
        play = get_object_or_404(Play, pk=pk, user=request.user)
        if play.paid_at:
            return Response({'detail': 'This play has already been used.'}, status=status.HTTP_409_CONFLICT)

        tx_hash = str(request.data.get('tx_hash', '')).lower()
        if not TX_HASH_RE.match(tx_hash):
            return Response({'tx_hash': ['Enter a valid transaction hash.']}, status=status.HTTP_400_BAD_REQUEST)
        if Play.objects.filter(tx_hash=tx_hash).exists():
            return Response(
                {'detail': 'This transaction has already been used.'}, status=status.HTTP_409_CONFLICT
            )

        try:
            listener = verify_play_payment(tx_hash, play.play_id, play.song_id)
        except PaymentError as exc:
            return Response({'detail': str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        except ChainError:
            return Response(
                {'detail': 'Could not reach the blockchain node to verify the payment. Try again.'},
                status=status.HTTP_502_BAD_GATEWAY,
            )

        play.tx_hash = tx_hash
        play.listener_address = listener
        play.paid_at = timezone.now()
        try:
            play.save(update_fields=['tx_hash', 'listener_address', 'paid_at'])
        except IntegrityError:
            return Response(
                {'detail': 'This transaction has already been used.'}, status=status.HTTP_409_CONFLICT
            )

        token = signing.dumps(play.pk, salt=STREAM_SALT)
        stream_url = request.build_absolute_uri(reverse('play-stream', args=[play.pk])) + f'?token={token}'
        return Response({'stream_url': stream_url, 'expires_in': STREAM_TOKEN_MAX_AGE})


@require_GET
def stream_play(request, pk):
    """Step 3: serve the audio. Uses a signed token because <audio> can't send an Authorization header."""
    try:
        signed_pk = signing.loads(request.GET.get('token', ''), salt=STREAM_SALT, max_age=STREAM_TOKEN_MAX_AGE)
    except signing.BadSignature:  # also covers SignatureExpired
        return HttpResponseForbidden('Stream link is invalid or expired.')
    if signed_pk != pk:
        return HttpResponseForbidden('Stream link is invalid or expired.')

    play = get_object_or_404(Play.objects.select_related('song'), pk=pk, paid_at__isnull=False)
    try:
        audio = play.song.file.open('rb')
    except FileNotFoundError:
        raise Http404('Audio file is missing.')
    content_type = mimetypes.guess_type(play.song.file.name)[0] or 'application/octet-stream'
    return FileResponse(audio, content_type=content_type)
