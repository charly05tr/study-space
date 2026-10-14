"""Factories for core ports, shared by every app.

The concrete image adapter is picked by the IMAGE_SERVICE_CLASS setting so a
settings module (e.g. desktop) can swap it without touching the views. Without
the setting the behaviour is the original one: Cloudinary.
"""

from django.conf import settings
from django.utils.module_loading import import_string

from apps.core.interfaces import IImageService

DEFAULT_IMAGE_SERVICE = 'apps.core.adapters.cloudinary_adapter.CloudinaryAdapter'


def get_image_service() -> IImageService:
    path = getattr(settings, 'IMAGE_SERVICE_CLASS', DEFAULT_IMAGE_SERVICE)
    return import_string(path)()
