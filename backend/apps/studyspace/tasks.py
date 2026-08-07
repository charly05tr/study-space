from celery import shared_task
from celery.utils.log import get_task_logger
from django.utils import timezone

from apps.core.adapters.smtp_adapter import SMTPAdapter
from apps.studyspace.models import PlannedSession
from apps.studyspace.services.planned_session_service import PlannedSessionService

logger = get_task_logger(__name__)


@shared_task
def task_sweep_session_reminders():
    """Barrido periódico: busca recordatorios vencidos y encola un envío por cada uno.

    Barrido y no `apply_async(eta=...)` al crear el plan. Con `eta`, cada
    reprogramación deja una tarea huérfana esperando en Redis y hay que
    revocarla -- un mecanismo que falla en silencio si el broker se reinició o
    si la revocación llegó tarde. El barrido no tiene nada que revocar: cada
    corrida vuelve a preguntarle a la base cuál es la verdad actual.
    """
    service = PlannedSessionService()
    due = list(service.due_reminders())

    for plan in due:
        task_send_session_reminder.delay(plan.pk)

    if due:
        logger.info(f"Recordatorios encolados: {len(due)}")
    return len(due)


@shared_task(bind=True, max_retries=3, default_retry_delay=60)
def task_send_session_reminder(self, planned_session_id):
    service = PlannedSessionService()

    try:
        plan = (
            PlannedSession.objects
            .select_related('studyspace', 'studyspace__user')
            .get(pk=planned_session_id)
        )
    except PlannedSession.DoesNotExist:
        logger.error(f"PlannedSession {planned_session_id} no encontrada.")
        return

    if plan.status != PlannedSession.Status.PLANNED:
        logger.info(f"PlannedSession {plan.pk} ya no está planificada; se omite.")
        return

    if not service.is_reminder_still_useful(plan):
        # El aviso perdió sentido, pero hay que sacarlo de la cola igual: sin
        # esto el barrido lo levantaría una y otra vez para siempre.
        service.claim_reminder(plan)
        logger.warning(f"Recordatorio vencido para PlannedSession {plan.pk}; descartado.")
        return

    # Reservar ANTES de mandar. Si el envío falla, se devuelve a la cola.
    if not service.claim_reminder(plan):
        logger.info(f"PlannedSession {plan.pk} ya fue tomada por otro worker.")
        return

    try:
        local_start = service.local_starts_at(plan)
        SMTPAdapter().send_session_reminder(
            user=plan.studyspace.user,
            context={
                'goal': plan.goal,
                'studyspace': plan.studyspace,
                'starts_at': local_start,
                'ends_at': plan.ends_at.astimezone(local_start.tzinfo),
                'timezone': plan.timezone,
                'minutes_before': plan.reminder_offset_minutes,
            },
        )
        logger.info(f"Recordatorio enviado para PlannedSession {plan.pk}")

    except Exception as exc:
        # Devolver la reserva para que el próximo barrido lo vuelva a tomar si
        # los reintentos de esta tarea se agotan.
        service.release_reminder(plan)
        logger.error(f"Error enviando recordatorio {plan.pk} (intento {self.request.retries}): {exc}")
        raise self.retry(exc=exc)


@shared_task
def task_mark_missed_sessions():
    """Cierra los planes que ya pasaron sin haberse iniciado.

    Sin esto el calendario se llena de bloques eternamente "planificados" y el
    usuario no puede distinguir lo que viene de lo que no hizo.
    """
    closed = PlannedSessionService().mark_missed(timezone.now())
    if closed:
        logger.info(f"Sesiones marcadas como no realizadas: {closed}")
    return closed
