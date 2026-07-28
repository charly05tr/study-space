from django.db import transaction

from apps.core.interfaces import IEmailService
from apps.users.tasks import (
    task_send,
    task_send_goodbye,
    task_send_reactivation_code,
    task_send_reset_code,
    task_send_verification_code,
    task_send_welcome,
)


class CeleryEmailAdapter(IEmailService):
    """
    Implementa IEmailService delegando el envio real a los workers de Celery.

    Todo se encola con transaction.on_commit: register_with_email corre dentro de
    @transaction.atomic, y sin esto el worker podria tomar la tarea antes del
    COMMIT y fallar con User.DoesNotExist / VerificationCode.DoesNotExist.
    Fuera de un bloque atomico, on_commit ejecuta de inmediato.
    """

    def send_welcome(self, user):
        transaction.on_commit(lambda: task_send_welcome.delay(user.id))

    def send_verification_code(self, user, code_obj):
        transaction.on_commit(
            lambda: task_send_verification_code.delay(user.id, code_obj.id)
        )

    def send_reset_code(self, user, code_obj):
        transaction.on_commit(
            lambda: task_send_reset_code.delay(user.id, code_obj.id)
        )

    def send_reactivation_code(self, user, code_obj):
        transaction.on_commit(
            lambda: task_send_reactivation_code.delay(user.id, code_obj.id)
        )

    def send_goodbye(self, user):
        transaction.on_commit(lambda: task_send_goodbye.delay(user.id))

    def send(self, user, message, subject):
        transaction.on_commit(
            lambda: task_send.delay(user.id, message, subject)
        )
