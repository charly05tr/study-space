import uuid
from pathlib import Path

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from django.db import transaction

from ..interfaces import IImageService

IMAGES_SUBDIR = 'images'


class LocalImageAdapter(IImageService):
    """Stores images under MEDIA_ROOT instead of a cloud service (desktop mode)."""

    def upload(self, image: UploadedFile) -> str:
        suffix = Path(image.name or '').suffix.lower()[:10]
        name = f'{uuid.uuid4().hex}{suffix}'
        target_dir = Path(settings.MEDIA_ROOT) / IMAGES_SUBDIR
        target_dir.mkdir(parents=True, exist_ok=True)

        with open(target_dir / name, 'wb') as out:
            for chunk in image.chunks():
                out.write(chunk)

        return f'{settings.MEDIA_URL}{IMAGES_SUBDIR}/{name}'

    def destroy(self, image_url: str):
        prefix = f'{settings.MEDIA_URL}{IMAGES_SUBDIR}/'
        if not image_url.startswith(prefix):
            return
        # Only a bare file name is accepted: never follow a path out of the folder.
        name = Path(image_url[len(prefix):]).name
        path = Path(settings.MEDIA_ROOT) / IMAGES_SUBDIR / name
        transaction.on_commit(lambda: path.unlink(missing_ok=True))
