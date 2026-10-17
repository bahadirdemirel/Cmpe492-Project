import math
import wave
from array import array
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand

SAMPLE_RATE = 22050
NOTE_OFFSETS = {'C': 0, 'C#': 1, 'D': 2, 'D#': 3, 'E': 4, 'F': 5, 'F#': 6, 'G': 7, 'G#': 8, 'A': 9, 'A#': 10, 'B': 11}

# Public-domain melodies as "NOTE:beats" (filename gives "Artist - Title")
DEMO_TRACKS = {
    'Ludwig van Beethoven - Ode to Joy': (
        120,
        'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 E4:1.5 D4:0.5 D4:2 '
        'E4:1 E4:1 F4:1 G4:1 G4:1 F4:1 E4:1 D4:1 C4:1 C4:1 D4:1 E4:1 D4:1.5 C4:0.5 C4:2',
    ),
    'Traditional - Twinkle Twinkle Little Star': (
        110,
        'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2 '
        'G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 G4:1 G4:1 F4:1 F4:1 E4:1 E4:1 D4:2 '
        'C4:1 C4:1 G4:1 G4:1 A4:1 A4:1 G4:2 F4:1 F4:1 E4:1 E4:1 D4:1 D4:1 C4:2',
    ),
    'Jukebox Demo - Sunrise Arpeggios': (
        140,
        ' '.join(
            f'{n}:0.5'
            for chord in ['C4 E4 G4 C5 G4 E4 C4 E4', 'A3 C4 E4 A4 E4 C4 A3 C4',
                          'F3 A3 C4 F4 C4 A3 F3 A3', 'G3 B3 D4 G4 D4 B3 G3 B3'] * 2
            for n in chord.split()
        ) + ' C4:2',
    ),
}


def frequency(note):
    name, octave = note[:-1], int(note[-1])
    semitones_from_a4 = NOTE_OFFSETS[name] + (octave - 4) * 12 - 9
    return 440.0 * 2 ** (semitones_from_a4 / 12)


def render(bpm, score):
    samples = array('h')
    for token in score.split():
        note, beats = token.split(':')
        n = int(float(beats) * 60 / bpm * SAMPLE_RATE)
        f = frequency(note)
        for i in range(n):
            t = i / SAMPLE_RATE
            # Soft attack, natural decay, and a short fade so notes don't click
            envelope = min(1.0, t / 0.01) * math.exp(-2.5 * i / n) * min(1.0, (n - i) / (0.02 * SAMPLE_RATE))
            tone = (
                math.sin(2 * math.pi * f * t)
                + 0.35 * math.sin(4 * math.pi * f * t)
                + 0.15 * math.sin(6 * math.pi * f * t)
            )
            samples.append(int(9000 * envelope * tone))
    return samples


class Command(BaseCommand):
    help = 'Write a few short synthesized demo songs into MEDIA_ROOT/music/ (skips existing files).'

    def handle(self, *args, **options):
        music_dir = Path(settings.MEDIA_ROOT) / 'music'
        music_dir.mkdir(parents=True, exist_ok=True)
        for name, (bpm, score) in DEMO_TRACKS.items():
            path = music_dir / f'{name}.wav'
            if path.exists():
                continue
            with wave.open(str(path), 'wb') as out:
                out.setnchannels(1)
                out.setsampwidth(2)
                out.setframerate(SAMPLE_RATE)
                out.writeframes(render(bpm, score).tobytes())
            self.stdout.write(f'  + {path.name}')
        self.stdout.write(self.style.SUCCESS('Demo tracks ready. Run `manage.py sync_music` to add them to the library.'))
