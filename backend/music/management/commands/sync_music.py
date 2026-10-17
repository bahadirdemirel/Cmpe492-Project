from pathlib import Path

import mutagen
from django.conf import settings
from django.core.management.base import BaseCommand

from music.models import AUDIO_EXTENSIONS, Song


def read_metadata(path):
    """Return (title, artist) from audio tags, falling back to "Artist - Title.ext"."""
    title = artist = ''
    try:
        audio = mutagen.File(path, easy=True)
        if audio and audio.tags:
            title = (audio.tags.get('title') or [''])[0]
            artist = (audio.tags.get('artist') or [''])[0]
    except (mutagen.MutagenError, OSError):
        pass

    if not title:
        name_artist, sep, name_title = path.stem.partition(' - ')
        title, artist = (name_title, artist or name_artist) if sep else (path.stem, artist)

    return title.strip(), artist.strip()


class Command(BaseCommand):
    help = 'Register audio files dropped into MEDIA_ROOT/music/ as Song records.'

    def add_arguments(self, parser):
        parser.add_argument(
            '--prune',
            action='store_true',
            help='Also delete Song records whose file no longer exists.',
        )

    def handle(self, *args, prune=False, **options):
        media_root = Path(settings.MEDIA_ROOT)
        music_dir = media_root / 'music'
        music_dir.mkdir(parents=True, exist_ok=True)

        known = set(Song.objects.values_list('file', flat=True))
        added = 0
        for path in sorted(music_dir.rglob('*')):
            if not path.is_file() or path.suffix.lower().lstrip('.') not in AUDIO_EXTENSIONS:
                continue
            name = path.relative_to(media_root).as_posix()
            if name in known:
                continue
            title, artist = read_metadata(path)
            Song.objects.create(title=title, artist=artist, file=name)
            added += 1
            self.stdout.write(f'  + {name}')

        removed = 0
        if prune:
            for song in Song.objects.all():
                if not (media_root / song.file.name).is_file():
                    self.stdout.write(f'  - {song.file.name}')
                    song.delete()
                    removed += 1

        self.stdout.write(self.style.SUCCESS(f'Added {added}, removed {removed} track(s).'))
