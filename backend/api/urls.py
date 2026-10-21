from django.urls import include, path

from . import views

urlpatterns = [
    path('health/', views.health, name='health'),
    path('auth/', include('users.urls')),
    path('', include('music.urls')),
]
