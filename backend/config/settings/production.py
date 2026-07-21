from decouple import config
from .base import *

SECRET_KEY = config('SECRET_KEY')
DEBUG = config('DEBUG').lower() in ('true', 't')

EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"

ANYMAIL = {
    "RESEND_API_KEY": config("RESEND_API_KEY"),
}

DATABASES = {
    'default': {
        'ENGINE': 'django.contrib.gis.db.backends.postgis',
        'NAME': config('DB_NAME'),
        'USER': config('DB_USER'),
        'PASSWORD': config('DB_PASSWORD'),
        'HOST': config('POSTGRES_HOST'),
        'PORT': config('POSTGRES_PORT')
    }
}

ALLOWED_HOSTS = [
    'studyspace.cetorres.dev',
]

CSRF_TRUSTED_ORIGINS = [
    'https://studyspace.cetorres.dev',
]

CORS_ALLOWED_ORIGINS = [
    "https://studyspace.cetorres.dev",
]

CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://redis:6379/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        }
    }
}

CELERY_BROKER_URL = "redis://redis:6379/1"

CELERY_TIMEZONE = 'America/Managua'

CELERY_RESULT_BACKEND = "redis://redis:6379/1"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("redis", 6379)],
        },
    },
}