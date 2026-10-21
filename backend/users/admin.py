from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin

from .models import User


@admin.register(User)
class UserAdmin(BaseUserAdmin):
    fieldsets = BaseUserAdmin.fieldsets + (('Web3', {'fields': ('wallet_address',)}),)
    add_fieldsets = BaseUserAdmin.add_fieldsets + (('Web3', {'fields': ('wallet_address',)}),)
    list_display = ('username', 'email', 'wallet_address', 'is_staff')
    search_fields = ('username', 'email', 'wallet_address')
