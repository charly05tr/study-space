from celery import shared_task
from celery.utils.log import get_task_logger
from django.contrib.auth import get_user_model
from apps.core.adapters.smtp_adapter import SMTPAdapter
from apps.users.models import VerificationCode

logger = get_task_logger(__name__)
User = get_user_model()

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_welcome(self, user_id):
    try:
        user = User.objects.get(pk=user_id)
        # El worker instancia el adaptador SMTP directo para enviar el correo real.
        smtp_adapter = SMTPAdapter() 
        smtp_adapter.send_welcome(user=user)
        
        logger.info(f"Email de bienvenida enviado a user_id: {user_id}")
    except User.DoesNotExist:
        logger.error(f"User {user_id} no encontrado")
    except Exception as exc:
        # Reintenta si falla la conexión SMTP
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_reset_code(self, user_id, code_id):
    try:
        user = User.objects.get(pk=user_id)
        code_obj = VerificationCode.objects.get(pk=code_id)

        smtp_adapter = SMTPAdapter()
        smtp_adapter.send_reset_code(user=user, code_obj=code_obj)

        logger.info(f"Email con codigo enviado a user_id: {user_id}")
    except (User.DoesNotExist, VerificationCode.DoesNotExist):
        logger.error(f"User {user_id} o codigo {code_id} no encontrado. No se reintentará.")
        
    except Exception as exc:
        logger.error(f"Error enviando email (Intento {self.request.retries}): {exc}")
        # Reintenta si falla la conexión SMTP
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_verification_code(self, user_id, code_id):
    try:
        user = User.objects.get(pk=user_id)
        code_obj = VerificationCode.objects.get(pk=code_id)

        smtp_adapter = SMTPAdapter()
        smtp_adapter.send_verification_code(user=user, code_obj=code_obj)

    except (User.DoesNotExist, VerificationCode.DoesNotExist):
        logger.error(f"User {user_id} o codigo {code_id} no encontrado. No se reintentará.")
    except Exception as exc:
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_reactivation_code(self, user_id, code_id):
    try:
        user = User.objects.get(pk=user_id)
        code_obj = VerificationCode.objects.get(pk=code_id)

        smtp_adapter = SMTPAdapter()
        smtp_adapter.send_reactivation_code(user=user, code_obj=code_obj)

    except (User.DoesNotExist, VerificationCode.DoesNotExist):
        logger.error(f"User {user_id} o codigo {code_id} no encontrado. No se reintentará.")
    except Exception as exc:
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_goodbye(self, user_id):
    try:
        user = User.objects.get(pk=user_id)

        smtp_adapter = SMTPAdapter()
        smtp_adapter.send_goodbye(user=user)

        logger.info(f"Email de despedida enviado a user_id: {user_id}")
    except User.DoesNotExist:
        logger.error(f"User {user_id} no encontrado")
    except Exception as exc:
        raise self.retry(exc=exc)

@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send(self, user_id, message, subject):
    try:
        user = User.objects.get(pk=user_id)

        smtp_adapter = SMTPAdapter() 
        smtp_adapter.send(user=user, message=message, subject=subject)
        
        logger.info(f"Email generico enviado a user_id: {user_id}")
    except User.DoesNotExist:
        logger.error(f"User {user_id} no encontrado")
    except Exception as exc:
        raise self.retry(exc=exc)