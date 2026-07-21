from ..interfaces import IImageService
from django.core.files.uploadedfile import UploadedFile
import cloudinary.uploader
from django.db import transaction
from apps.core.tasks import task_destroy_cloudinary

class CloudinaryAdapter(IImageService):
    def upload(self, image: UploadedFile):
        upload_result = cloudinary.uploader.upload(image)
        image_url = upload_result.get('secure_url')
        return image_url

    def destroy(self, image_url: str):
        transaction.on_commit(
            lambda: task_destroy_cloudinary.delay(image_url)
        )