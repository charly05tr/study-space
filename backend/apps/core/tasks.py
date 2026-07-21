from celery import shared_task
from celery.utils.log import get_task_logger
import cloudinary.uploader

logger = get_task_logger(__name__)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_destroy_cloudinary(self, image_url: str):
    try:
        public_id = image_url.split('/')[-1].split('.')[0]
        cloudinary.uploader.destroy(public_id)
        logger.info(f"Imagen eliminada: {public_id}")
    except Exception as exc:
        logger.error(f"Error eliminando imagen: {exc}")
        raise self.retry(exc=exc)