from decouple import config
from .base import *

SECRET_KEY = 'django-insecure-lj9pxq4ve(21qa(o2phy&x+vah9#2xv6#r+p-rs7ba^3da7=wd'

#base de datos posgre en local (credenciales en .env)
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

DEBUG = True

ALLOWED_HOSTS = ['*']


CACHES = {
    "default": {
        "BACKEND": "django_redis.cache.RedisCache",
        "LOCATION": "redis://redis:6379/1",
        "OPTIONS": {
            "CLIENT_CLASS": "django_redis.client.DefaultClient",
        }
    }
}

from celery.schedules import crontab

CELERY_BEAT_SCHEDULE = {
    'check-no-shows-every-hour': {
        'task': 'apps.orders.tasks.process_no_shows_task', 
        'schedule': crontab(minute=0), 
    },
}

CELERY_BROKER_URL = "redis://redis:6379/1"

CELERY_RESULT_BACKEND = "redis://redis:6379/1"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("redis", 6379)],
        },
    },
}