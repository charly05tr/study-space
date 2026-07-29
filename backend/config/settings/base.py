from pathlib import Path
from datetime import timedelta
from decouple import config
import cloudinary

# settings/base.py -> settings/ -> config/ -> raiz del proyecto.
# Con un .parent menos, MEDIA_ROOT apuntaba a config/media/ mientras nginx
# sirve /media/ desde la raiz, y todo archivo subido daba 404.
BASE_DIR = Path(__file__).resolve().parent.parent.parent

INSTALLED_APPS = [
    'daphne',
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    "django.contrib.gis",
    'rest_framework',
    'rest_framework.authtoken',
    'django_filters',
    'corsheaders',
    'apps.core',
    'apps.users',
    'apps.studyspace',
    'silk',
    'anymail',
    'drf_spectacular',
    'django_celery_beat',
    'channels',
]

SILKY_AUTHENTICATION = True
SILKY_AUTHORISATION = True

MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'corsheaders.middleware.CorsMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
    'silk.middleware.SilkyMiddleware',
]

ROOT_URLCONF = 'config.urls'

TEMPLATES = [
    {
        'BACKEND': 'django.template.backends.django.DjangoTemplates',
        'DIRS': ['/app/config/templates'],
        'APP_DIRS': True,
        'OPTIONS': {
            'context_processors': [
                'django.template.context_processors.request',
                'django.contrib.auth.context_processors.auth',
                'django.contrib.messages.context_processors.messages',
            ],
        },
    },
]

WSGI_APPLICATION = 'config.wsgi.application'
ASGI_APPLICATION = 'config.asgi.application'

AUTH_PASSWORD_VALIDATORS = [
    {
        'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator',
    },
    {
        'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator',
    },
]

LANGUAGE_CODE = 'en-us'

TIME_ZONE = 'America/Managua'

USE_I18N = True

USE_TZ = True

STATIC_URL = '/static/'

MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"

STATIC_ROOT = '/app/staticfiles'

AUTH_USER_MODEL = 'users.User'

REST_FRAMEWORK = {
    # JWT first on purpose. DRF builds the WWW-Authenticate header from the
    # FIRST class listed, and SessionAuthentication has none to give, so a
    # failed authentication was downgraded from 401 to 403 -- which the
    # frontend cannot tell apart from a permission error, leaving expired
    # access tokens to look like a denied request instead of a refreshable one.
    'DEFAULT_AUTHENTICATION_CLASSES': (
        'rest_framework_simplejwt.authentication.JWTAuthentication',
        'rest_framework.authentication.SessionAuthentication',
    ),
    'DEFAULT_PERMISSION_CLASSES': (
        'rest_framework.permissions.IsAuthenticated',
    ),
    "DEFAULT_FILTER_BACKENDS": [
    "django_filters.rest_framework.DjangoFilterBackend"
    ],
    'DEFAULT_SCHEMA_CLASS': 'drf_spectacular.openapi.AutoSchema',
    'DEFAULT_PAGINATION_CLASS': 'rest_framework.pagination.PageNumberPagination',
    'PAGE_SIZE': 10,  
}

SIMPLE_JWT = {
    'ACCESS_TOKEN_LIFETIME': timedelta(minutes=5),
    'REFRESH_TOKEN_LIFETIME': timedelta(days=7),
}

SPECTACULAR_SETTINGS = {
    'TITLE': 'STUDYSPACE API',
    'DESCRIPTION': 'API de studyspace',
    'VERSION': '1.0.0',
    'SERVE_INCLUDE_SCHEMA': False,
    # OTHER SETTINGS
}

CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [("redis", 6379)],
        },
    },
}

#email configs
EMAIL_BACKEND = "anymail.backends.resend.EmailBackend"
EMAIL_HOST = config('EMAIL_HOST')
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = "resend"
EMAIL_HOST_PASSWORD = config('RESEND_API_KEY')
DEFAULT_FROM_EMAIL = 'Studyspace App <noreply@cetorres.dev>'

#cloudinary configs
cloudinary.config(
  cloud_name=config('CLOUDINARY_NAME'),
  api_key=config('CLOUDINARY_API_KEY'),
  api_secret=config('CLOUDINARY_API_SECRET'),
)


# SECURE_PROXY_SSL_HEADER = ('HTTP_X_FORWARDED_PROTO', 'https')
