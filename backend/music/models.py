import secrets

from django.conf import settings
from django.core.validators import FileExtensionValidator
from django.db import models

AUDIO_EXTENSIONS = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac']


class Song(models.Model):
    title = models.CharField(max_length=200)
    artist = models.CharField(max_length=200, blank=True)
    # Path relative to MEDIA_ROOT, e.g. "music/artist - title.mp3"
    file = models.FileField(
        upload_to='music/',
        max_length=255,
        unique=True,
        validators=[FileExtensionValidator(AUDIO_EXTENSIONS)],
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['artist', 'title']

    def __str__(self):
        return f'{self.artist} - {self.title}' if self.artist else self.title


def new_play_id():
    return '0x' + secrets.token_hex(32)


class Play(models.Model):
    """One paid playback. Created before payment; confirmed once its on-chain payment is verified."""

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='plays')
    song = models.ForeignKey(Song, on_delete=models.CASCADE, related_name='plays')
    # bytes32 passed to JukeCoin.payForPlay, so a payment can only confirm the play it was made for
    play_id = models.CharField(max_length=66, unique=True, default=new_play_id, editable=False)
    tx_hash = models.CharField(max_length=66, unique=True, null=True, blank=True)
    listener_address = models.CharField(max_length=42, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f'{self.user} → {self.song} ({"paid" if self.paid_at else "pending"})'
