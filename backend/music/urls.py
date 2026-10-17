from django.urls import path

from . import views

urlpatterns = [
    path('tracks/', views.SongListView.as_view(), name='track-list'),
    path('tracks/<int:pk>/plays/', views.PlayCreateView.as_view(), name='play-create'),
    path('plays/<int:pk>/confirm/', views.PlayConfirmView.as_view(), name='play-confirm'),
    path('plays/<int:pk>/stream/', views.stream_play, name='play-stream'),
]
