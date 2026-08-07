from datetime import timedelta
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from django.db import transaction
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.studyspace.models import PlannedSession, StudySession, Studyspace
from apps.studyspace.services.study_session_service import StudySessionService
from apps.users.models import User

# Los límites de lo que tiene sentido reservar como bloque. Menos de cinco
# minutos no es una sesión de estudio, y un bloque de más de doce horas es casi
# siempre un error de tipeo en el selector de hora, no un plan.
MIN_DURATION = timedelta(minutes=5)
MAX_DURATION = timedelta(hours=12)

# Avisar con más de una semana no es un recordatorio, es otra cosa.
MAX_REMINDER_OFFSET_MINUTES = 7 * 24 * 60

# Si el recordatorio venció mientras el broker estaba caído, mandarlo tarde es
# peor que no mandarlo: un correo que dice "empieza en una hora" cuando la
# sesión ya arrancó desinforma. Fuera de esta ventana se descarta.
REMINDER_GRACE = timedelta(minutes=15)


class PlannedSessionService:
    """Planificación de sesiones: reservar el bloque, moverlo, y arrancarlo.

    El servicio es dueño de dos cosas que el cliente no puede escribir: el
    estado del plan y `reminder_at`. La primera porque una transición inválida
    (arrancar algo cancelado) tiene que ser imposible y no solo improbable; la
    segunda porque es un dato derivado, y derivarlo en dos lugares distintos es
    garantizar que algún día no coincidan.
    """

    def __init__(self, session_service: StudySessionService | None = None):
        self.session_service = session_service or StudySessionService()

    # -- Lectura --------------------------------------------------------

    def get_user_planned_sessions(self, user: User):
        return (
            PlannedSession.objects
            .filter(studyspace__user=user)
            .select_related('studyspace', 'study_session')
            # El calendario se lee hacia adelante, al revés que el historial.
            .order_by('starts_at')
        )

    # -- Escritura ------------------------------------------------------

    def create(
        self,
        studyspace: Studyspace,
        goal: str,
        starts_at,
        ends_at,
        timezone_name: str,
        reminder_offset_minutes: int | None = 60,
    ) -> PlannedSession:
        self._validate_block(starts_at, ends_at, require_future=True)
        self._validate_timezone(timezone_name)
        self._validate_offset(reminder_offset_minutes)

        return PlannedSession.objects.create(
            studyspace=studyspace,
            goal=goal,
            starts_at=starts_at,
            ends_at=ends_at,
            timezone=timezone_name,
            reminder_offset_minutes=reminder_offset_minutes,
            reminder_at=self._reminder_at(starts_at, reminder_offset_minutes),
        )

    def reschedule(self, plan: PlannedSession, **changes) -> PlannedSession:
        """Mueve o edita un plan que todavía no arrancó.

        Reprogramar reabre el recordatorio. Si ya se había mandado el correo y
        el usuario corre la sesión al día siguiente, el aviso que recibió dejó
        de ser cierto: lo que corresponde es avisar de nuevo sobre el horario
        nuevo, no quedarse callado porque técnicamente ya se avisó una vez.
        """
        if plan.status != PlannedSession.Status.PLANNED:
            raise ValidationError(
                "Solo se puede reprogramar una sesión que sigue planificada."
            )

        starts_at = changes.get('starts_at', plan.starts_at)
        ends_at = changes.get('ends_at', plan.ends_at)
        # Mover un bloque exige que el destino esté en el futuro; editar solo el
        # objetivo de una sesión que ya empezó a correr en el reloj, no.
        moved = starts_at != plan.starts_at or ends_at != plan.ends_at
        self._validate_block(starts_at, ends_at, require_future=moved)

        if 'timezone' in changes:
            self._validate_timezone(changes['timezone'])
        if 'reminder_offset_minutes' in changes:
            self._validate_offset(changes['reminder_offset_minutes'])

        for field, value in changes.items():
            setattr(plan, field, value)

        plan.reminder_at = self._reminder_at(
            plan.starts_at, plan.reminder_offset_minutes
        )
        plan.reminder_sent_at = None
        plan.save()
        return plan

    def cancel(self, plan: PlannedSession) -> PlannedSession:
        """Cancela el plan. Idempotente: cancelar dos veces no es un error."""
        if plan.status in (
            PlannedSession.Status.STARTED,
            PlannedSession.Status.COMPLETED,
        ):
            raise ValidationError("La sesión ya empezó; no se puede cancelar.")

        if plan.status != PlannedSession.Status.CANCELLED:
            plan.status = PlannedSession.Status.CANCELLED
            # Sin esto el barrido mandaría el recordatorio de algo cancelado.
            plan.reminder_at = None
            plan.save(update_fields=['status', 'reminder_at', 'updated_at'])
        return plan

    @transaction.atomic
    def start(
        self, plan: PlannedSession, focus_minutes: int, rest_minutes: int
    ) -> StudySession:
        """Convierte el plan en una sesión real y los enlaza.

        El ritmo se elige acá y no al planificar: cuando reservaste el bloque
        el miércoles no sabías con cuánta cabeza ibas a llegar el viernes.
        """
        if plan.status != PlannedSession.Status.PLANNED:
            raise ValidationError("Esta sesión ya fue iniciada o cancelada.")

        # StudySessionService.start es quien sabe que no puede haber dos
        # sesiones abiertas en el mismo espacio. Esa regla no se duplica acá.
        session = self.session_service.start(
            studyspace=plan.studyspace,
            goal=plan.goal,
            focus_minutes=focus_minutes,
            rest_minutes=rest_minutes,
        )

        plan.study_session = session
        plan.status = PlannedSession.Status.STARTED
        plan.reminder_at = None
        plan.save(update_fields=[
            'study_session', 'status', 'reminder_at', 'updated_at'
        ])
        return session

    # -- Recordatorios --------------------------------------------------

    def due_reminders(self, now=None):
        """Los planes cuyo recordatorio vence y todavía no salió."""
        now = now or timezone.now()
        return (
            PlannedSession.objects
            .filter(
                status=PlannedSession.Status.PLANNED,
                reminder_at__isnull=False,
                reminder_at__lte=now,
                reminder_sent_at__isnull=True,
            )
            .select_related('studyspace', 'studyspace__user')
        )

    def claim_reminder(self, plan: PlannedSession, now=None) -> bool:
        """Marca el recordatorio como enviado ANTES de mandarlo, en una sola
        escritura condicional.

        Dos workers pueden levantar el mismo plan si un barrido se solapa con el
        siguiente. Un UPDATE con `reminder_sent_at IS NULL` en el WHERE lo
        resuelve en la base: exactamente uno de los dos ve `1` fila afectada.
        Chequear en Python y guardar después deja una ventana entre las dos
        operaciones, y esa ventana es el correo duplicado.
        """
        now = now or timezone.now()
        claimed = PlannedSession.objects.filter(
            pk=plan.pk, reminder_sent_at__isnull=True
        ).update(reminder_sent_at=now)
        return claimed == 1

    def release_reminder(self, plan: PlannedSession) -> None:
        """Devuelve el recordatorio a la cola si el envío falló."""
        PlannedSession.objects.filter(pk=plan.pk).update(reminder_sent_at=None)

    def is_reminder_still_useful(self, plan: PlannedSession, now=None) -> bool:
        now = now or timezone.now()
        return plan.starts_at > now - REMINDER_GRACE

    def local_starts_at(self, plan: PlannedSession):
        """`starts_at` en la zona con la que se planificó, para el correo."""
        try:
            return plan.starts_at.astimezone(ZoneInfo(plan.timezone))
        except (ZoneInfoNotFoundError, ValueError):
            # Una zona inválida no justifica perder el recordatorio.
            return plan.starts_at

    def mark_missed(self, now=None) -> int:
        """Cierra los planes que quedaron atrás sin haberse iniciado."""
        now = now or timezone.now()
        return (
            PlannedSession.objects
            .filter(status=PlannedSession.Status.PLANNED, ends_at__lt=now)
            .update(
                status=PlannedSession.Status.MISSED,
                reminder_at=None,
                updated_at=now,
            )
        )

    # -- Validación -----------------------------------------------------

    def _validate_block(self, starts_at, ends_at, require_future: bool) -> None:
        if ends_at <= starts_at:
            raise ValidationError(
                {'ends_at': "El bloque tiene que terminar después de empezar."}
            )

        duration = ends_at - starts_at
        if duration < MIN_DURATION:
            raise ValidationError(
                {'ends_at': f"El bloque mínimo es de {int(MIN_DURATION.total_seconds() // 60)} minutos."}
            )
        if duration > MAX_DURATION:
            raise ValidationError(
                {'ends_at': f"El bloque máximo es de {int(MAX_DURATION.total_seconds() // 3600)} horas."}
            )

        if require_future and starts_at <= timezone.now():
            raise ValidationError(
                {'starts_at': "No se puede planificar una sesión en el pasado."}
            )

    def _validate_timezone(self, name: str) -> None:
        try:
            ZoneInfo(name)
        except (ZoneInfoNotFoundError, ValueError):
            raise ValidationError({'timezone': f"Zona horaria desconocida: {name}."})

    def _validate_offset(self, minutes: int | None) -> None:
        if minutes is None:
            return
        if not 0 <= minutes <= MAX_REMINDER_OFFSET_MINUTES:
            raise ValidationError({
                'reminder_offset_minutes':
                    f"Tiene que estar entre 0 y {MAX_REMINDER_OFFSET_MINUTES} minutos.",
            })

    def _reminder_at(self, starts_at, offset_minutes: int | None):
        if offset_minutes is None:
            return None
        return starts_at - timedelta(minutes=offset_minutes)
