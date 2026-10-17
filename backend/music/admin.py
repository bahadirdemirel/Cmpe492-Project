from django.contrib import admin

from .models import Play, Song


@admin.register(Song)
class SongAdmin(admin.ModelAdmin):
    list_display = ('title', 'artist', 'file', 'created_at')
    search_fields = ('title', 'artist')


@admin.register(Play)
class PlayAdmin(admin.ModelAdmin):
    list_display = ('song', 'user', 'listener_address', 'paid_at', 'created_at')
    list_filter = ('paid_at',)
    search_fields = ('user__username', 'listener_address', 'tx_hash')
    readonly_fields = ('play_id', 'tx_hash', 'listener_address', 'paid_at', 'created_at')
