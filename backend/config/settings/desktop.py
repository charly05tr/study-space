"""Settings for desktop mode: one local user, one process, no external services.

Opt-in only (DJANGO_SETTINGS_MODULE=config.settings.desktop, set by desktop.py).
It runs without a .env file: every variable base.py requires gets a dummy
default below, and nothing talks to Postgres, Redis, Celery, Cloudinary or an
email provider.
"""

import os
import secrets
import sys
from pathlib import Path


def _resolve_data_dir() -> Path:
    override = os.environ.get('STUDYSPACE_DATA_DIR')
    if override:
        return Path(override).expanduser()
    local_app_data = os.environ.get('LOCALAPPDATA')
    if local_app_data:
        return Path(local_app_data) / 'StudySpace'
    return Path.home() / '.studyspace'


DATA_DIR = _resolve_data_dir()
DATA_DIR.mkdir(parents=True, exist_ok=True)

# base.py reads these through decouple, which checks the environment first.
# They are never used for real calls in desktop mode.
for _key in (
    'EMAIL_HOST',
    'RESEND_API_KEY',
    'CLOUDINARY_NAME',
    'CLOUDINARY_API_KEY',
    'CLOUDINARY_API_SECRET',
):
    os.environ.setdefault(_key, 'desktop-unused')

from .base import *  # noqa: E402,F401,F403
from .base import INSTALLED_APPS, MIDDLEWARE, REST_FRAMEWORK, TEMPLATES  # noqa: E402
from ..paths import bundle_root, frontend_dist_default, is_frozen  # noqa: E402


def _load_secret_key() -> str:
    key_file = DATA_DIR / 'secret_key'
    if key_file.is_file():
        return key_file.read_text(encoding='utf-8').strip()
    key = secrets.token_urlsafe(64)
    key_file.write_text(key, encoding='utf-8')
    return key


SECRET_KEY = _load_secret_key()
DEBUG = False
ALLOWED_HOSTS = ['localhost', '127.0.0.1', '[::1]']

# --- Apps -------------------------------------------------------------------
# No model uses GIS fields; silk is a dev profiler; beat is replaced by
# APScheduler (see config/desktop_scheduler.py).
_REMOVED_APPS = {'django.contrib.gis', 'silk', 'django_celery_beat'}
INSTALLED_APPS = [app for app in INSTALLED_APPS if app not in _REMOVED_APPS]

MIDDLEWARE = [m for m in MIDDLEWARE if m != 'silk.middleware.SilkyMiddleware']
MIDDLEWARE.insert(1, 'whitenoise.middleware.WhiteNoiseMiddleware')

ROOT_URLCONF = 'config.urls_desktop'

# base.py points at the Docker path /app/config/templates.
TEMPLATES = [{**TEMPLATES[0], 'DIRS': [bundle_root() / 'config' / 'templates']}]

# --- Database ---------------------------------------------------------------
DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.sqlite3',
        'NAME': DATA_DIR / 'db.sqlite3',
        'OPTIONS': {
            'timeout': 20,
            'transaction_mode': 'IMMEDIATE',
            'init_command': 'PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL;',
        },
    }
}

# --- Files ------------------------------------------------------------------
MEDIA_ROOT = DATA_DIR / 'media'

# Frozen builds ship the collected static files (collected at build time, so they
# always match the shipped code). From source they are collected into DATA_DIR on
# first run; STUDYSPACE_STATIC_ROOT lets the build script target another folder.
if is_frozen():
    STATIC_ROOT = bundle_root() / 'staticfiles'
else:
    STATIC_ROOT = Path(os.environ.get('STUDYSPACE_STATIC_ROOT', DATA_DIR / 'staticfiles'))

# Built by `pnpm build:desktop`; WhiteNoise serves its assets at the site root.
FRONTEND_DIST = Path(
    os.environ.get('STUDYSPACE_FRONTEND_DIST', frontend_dist_default())
)
if FRONTEND_DIST.is_dir():
    WHITENOISE_ROOT = FRONTEND_DIST

# Images go to MEDIA_ROOT instead of Cloudinary (ports & adapters, see apps/core/dependencies.py).
IMAGE_SERVICE_CLASS = 'apps.core.adapters.local_storage_adapter.LocalImageAdapter'

# --- Auth: single local user, no login --------------------------------------
REST_FRAMEWORK = {
    **REST_FRAMEWORK,
    'DEFAULT_AUTHENTICATION_CLASSES': ('apps.core.authentication.LocalUserAuthentication',),
}

# --- Cache / channels / celery: all in memory -------------------------------
CACHES = {'default': {'BACKEND': 'django.core.cache.backends.locmem.LocMemCache'}}
CHANNEL_LAYERS = {'default': {'BACKEND': 'channels.layers.InMemoryChannelLayer'}}

CELERY_TASK_ALWAYS_EAGER = True
CELERY_TASK_EAGER_PROPAGATES = True
CELERY_BROKER_URL = 'memory://'
CELERY_RESULT_BACKEND = 'cache+memory://'

# --- Email: swallowed. Nobody to send to in single-user mode ----------------
EMAIL_BACKEND = 'django.core.mail.backends.dummy.EmailBackend'

# --- Logging: file, because pythonw has no console --------------------------
LOGGING = {
    'version': 1,
    'disable_existing_loggers': False,
    'handlers': {
        'file': {
            'class': 'logging.handlers.RotatingFileHandler',
            'filename': str(DATA_DIR / 'studyspace.log'),
            'maxBytes': 1_000_000,
            'backupCount': 2,
            'encoding': 'utf-8',
        },
    },
    'root': {'handlers': ['file'], 'level': 'INFO'},
}
if sys.stderr is not None and sys.stderr.isatty():
    LOGGING['handlers']['console'] = {'class': 'logging.StreamHandler'}
    LOGGING['root']['handlers'].append('console')
