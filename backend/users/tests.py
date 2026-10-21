from django.core.cache import cache
from django.core.exceptions import ValidationError
from django.test import TestCase
from django.urls import reverse
from rest_framework.authtoken.models import Token
from rest_framework.test import APIClient

from .models import User

ADDRESS = '0xAbC0000000000000000000000000000000000001'
PASSWORD = 'correct-horse-battery-staple'


class WalletAddressTests(TestCase):
    def test_address_is_stored_lowercase(self):
        user = User.objects.create_user(username='alice', wallet_address=ADDRESS)
        self.assertEqual(user.wallet_address, ADDRESS.lower())

    def test_invalid_address_is_rejected(self):
        user = User(username='bob', wallet_address='0x123')
        with self.assertRaises(ValidationError):
            user.full_clean()

    def test_users_without_wallet_do_not_collide(self):
        User.objects.create_user(username='a', wallet_address='')
        User.objects.create_user(username='b')
        self.assertEqual(User.objects.filter(wallet_address__isnull=True).count(), 2)


class AuthApiTests(TestCase):
    def setUp(self):
        cache.clear()  # reset login throttling between tests
        self.client = APIClient()

    def test_register_creates_user_and_returns_token(self):
        response = self.client.post(
            reverse('auth-register'),
            {'username': 'alice', 'email': 'alice@example.com', 'password': PASSWORD},
            format='json',
        )
        self.assertEqual(response.status_code, 201)
        user = User.objects.get(username='alice')
        self.assertTrue(user.check_password(PASSWORD))
        self.assertEqual(response.data['token'], Token.objects.get(user=user).key)
        self.assertEqual(response.data['user']['username'], 'alice')
        self.assertNotIn('password', response.data['user'])

    def test_register_rejects_weak_password_and_duplicate_username(self):
        weak = self.client.post(
            reverse('auth-register'), {'username': 'bob', 'password': '123'}, format='json'
        )
        self.assertEqual(weak.status_code, 400)
        self.assertIn('password', weak.data)

        User.objects.create_user(username='carol', password=PASSWORD)
        duplicate = self.client.post(
            reverse('auth-register'), {'username': 'carol', 'password': PASSWORD}, format='json'
        )
        self.assertEqual(duplicate.status_code, 400)
        self.assertIn('username', duplicate.data)

    def test_login_returns_token_only_for_valid_credentials(self):
        User.objects.create_user(username='dave', password=PASSWORD)

        bad = self.client.post(
            reverse('auth-login'), {'username': 'dave', 'password': 'wrong'}, format='json'
        )
        self.assertEqual(bad.status_code, 400)

        good = self.client.post(
            reverse('auth-login'), {'username': 'dave', 'password': PASSWORD}, format='json'
        )
        self.assertEqual(good.status_code, 200)
        self.assertEqual(good.data['user']['username'], 'dave')

    def test_me_and_logout_use_the_token(self):
        user = User.objects.create_user(username='erin', password=PASSWORD)
        token = Token.objects.create(user=user)

        self.assertEqual(self.client.get(reverse('auth-me')).status_code, 401)

        self.client.credentials(HTTP_AUTHORIZATION=f'Token {token.key}')
        self.assertEqual(self.client.get(reverse('auth-me')).data['username'], 'erin')

        self.assertEqual(self.client.post(reverse('auth-logout')).status_code, 204)
        self.assertFalse(Token.objects.filter(key=token.key).exists())
        self.assertEqual(self.client.get(reverse('auth-me')).status_code, 401)
