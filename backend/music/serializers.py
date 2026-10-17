from rest_framework import serializers

from .models import Play, Song


class SongSerializer(serializers.ModelSerializer):
    # No file URL here: audio is only reachable through a paid play's stream link.
    class Meta:
        model = Song
        fields = ['id', 'title', 'artist']


class PlaySerializer(serializers.ModelSerializer):
    song_id = serializers.IntegerField(read_only=True)

    class Meta:
        model = Play
        fields = ['id', 'song_id', 'play_id']
