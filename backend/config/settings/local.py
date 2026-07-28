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

# CORS: el front de Vite corre en otro origen (localhost:5173) que el API
# (localhost:8000). Sin esto CorsMiddleware no agrega Access-Control-Allow-Origin,
# el navegador corta en el preflight OPTIONS y el POST nunca se envia.
# Regex en vez de lista fija porque Vite salta a 5174, 5175... si el puerto
# esta ocupado. Solo para desarrollo: production.py usa CORS_ALLOWED_ORIGINS.
CORS_ALLOWED_ORIGIN_REGEXES = [
    r"^http://(localhost|127\.0\.0\.1):\d+$",
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

CELERY_RESULT_BACKEND = "redis://redis:6379/1"

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("redis", 6379)],
        },
    },
}

ANYMAIL = {
    "RESEND_API_KEY": config("RESEND_API_KEY"),
}