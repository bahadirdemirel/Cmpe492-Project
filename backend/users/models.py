from django.contrib.auth.models import AbstractUser
from django.core.validators import RegexValidator
from django.db import models

ethereum_address_validator = RegexValidator(
    regex=r'^0x[a-fA-F0-9]{40}$',
    message='Enter a valid Ethereum address (0x followed by 40 hex characters).',
)


class User(AbstractUser):
    # Stored lowercase so lookups don't depend on EIP-55 checksum casing.
    wallet_address = models.CharField(
        max_length=42,
        unique=True,
        null=True,
        blank=True,
        validators=[ethereum_address_validator],
    )

    def save(self, *args, **kwargs):
        if self.wallet_address:
            self.wallet_address = self.wallet_address.lower()
        else:
            # Empty strings would collide on the unique constraint; NULLs don't.
            self.wallet_address = None
        super().save(*args, **kwargs)

    def __str__(self):
        return self.username
