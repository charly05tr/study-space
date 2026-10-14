"""
Fabricas de dependencias para las vistas de users.

Un unico lugar donde se decide que implementacion concreta recibe cada servicio.
Para enviar correo de forma sincrona (por ejemplo, sin worker de Celery
levantado en desarrollo) se cambia aqui por SMTPAdapter y nada mas.
"""

from apps.core.dependencies import get_image_service  # noqa: F401  (re-exported)
from apps.core.interfaces import IEmailService
from apps.users.adapters.celery_email_adapter import CeleryEmailAdapter


def get_email_service() -> IEmailService:
    return CeleryEmailAdapter()

