from django.db import models
from django.contrib.auth.models import AbstractUser
from django.contrib.auth.base_user import BaseUserManager
from django.utils.translation import gettext_lazy as _
from django.utils import timezone
import random

class CustomUserManager(BaseUserManager):
    """
    Manager personalizado para usar email como identificador único
    en lugar de usernames.
    """
    def create_user(self, email, password, **extra_fields):
        if not email:
            raise ValueError(_('El email es obligatorio'))
        
        email = self.normalize_email(email)
        if "username" not in extra_fields:
            extra_fields["username"] = email
        
        user = self.model(email=email, **extra_fields)
        
        if password:
            user.set_password(password)
        else:
            # Para usuarios de Google que no tienen password al inicio
            user.set_unusable_password()
            
        user.save(using=self._db)
        return user

    def create_superuser(self, email, password, **extra_fields):
        extra_fields.setdefault('is_staff', True)
        extra_fields.setdefault('is_superuser', True)
        extra_fields.setdefault('is_active', True)

        if extra_fields.get('is_staff') is not True:
            raise ValueError(_('Superuser must have is_staff=True.'))
        if extra_fields.get('is_superuser') is not True:
            raise ValueError(_('Superuser must have is_superuser=True.'))

        return self.create_user(email, password, **extra_fields)

class User(AbstractUser):
    email = models.EmailField(unique=True) 
    phone = models.CharField(max_length=20, blank=True)
    is_verified = models.BooleanField(default=False)

    avatar_url = models.URLField(blank=True, null=True)

    USERNAME_FIELD = 'email' # Login con Email, no username
    REQUIRED_FIELDS = ['username']

    objects = CustomUserManager()
    

class VerificationCode(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='verification_codes')
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()

    def is_valid(self):
        return timezone.now() < self.expires_at

    @classmethod
    def create_for_user(cls, user):
        # Generar código de 6 dígitos
        code = ''.join([str(random.randint(0, 9)) for _ in range(6)])
        # Expira en 15 minutos
        expires_at = timezone.now() + timezone.timedelta(minutes=15)
        return cls.objects.create(user=user, code=code, expires_at=expires_at)


class UserImage(models.Model):
    url = models.URLField()
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="user_images")
    created_at = models.DateTimeField(auto_now_add=True)
