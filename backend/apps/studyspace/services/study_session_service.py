from datetime import timedelta

from django.db.models import F
from django.utils import timezone
from rest_framework.exceptions import ValidationError

from apps.studyspace.models import StudySession, Studyspace
from apps.users.models import User

# El reloj corre en el navegador, no acá. Estos son los límites de lo que tiene
# sentido guardar como configuración de una sesión, no una validación de UI:
# cero minutos no es una sesión, y un pomodoro de un día no es un pomodoro.
MIN_MINUTES = 1
MAX_MINUTES = 180


class StudySessionService:
    """Sesiones de estudio: la configuración, el conteo y el cierre.

    El temporizador NO vive acá. Un reloj en el servidor obligaría a preguntarle
    la hora en cada segundo y se rompería igual al cerrar la pestaña; lo que
    queda para siempre es el registro — qué te propusiste, con qué ritmo, y
    cuántos ciclos completaste.
    """

    def get_user_sessions(self, user: User):
        return (
            StudySession.objects
            .filter(studyspace__user=user)
            .select_related('studyspace')
            # El historial se lee empezando por lo último que hiciste.
            .order_by('-created_at')
        )

    def active_session(self, studyspace: Studyspace) -> StudySession | None:
        return (
            StudySession.objects
            .filter(studyspace=studyspace, finished_at__isnull=True)
            .order_by('-created_at')
            .first()
        )

    def start(self, studyspace: Studyspace, goal: str, focus_minutes: int, rest_minutes: int) -> StudySession:
        # Dos sesiones abiertas a la vez en el mismo espacio no son dos sesiones:
        # son una sesión y una que quedó sin cerrar. El front reanuda la activa.
        if self.active_session(studyspace) is not None:
            raise ValidationError(
                "Ya hay una sesión abierta en este studyspace. Cerrala antes de empezar otra."
            )

        return StudySession.objects.create(
            studyspace=studyspace,
            goal=goal,
            focus_time_duration=self._minutes(focus_minutes, 'focus_minutes'),
            rest_time_duration=self._minutes(rest_minutes, 'rest_minutes'),
        )

    def complete_pomodoro(self, session: StudySession) -> StudySession:
        """Suma un ciclo de focus terminado.

        F() y no `session.completed_pomodoros + 1`: el contador lo incrementa la
        base, así dos pestañas con la misma sesión abierta no se pisan el valor.
        """
        if not session.is_active:
            raise ValidationError("La sesión ya está cerrada.")

        StudySession.objects.filter(pk=session.pk).update(
            completed_pomodoros=F('completed_pomodoros') + 1
        )
        session.refresh_from_db(fields=['completed_pomodoros'])
        return session

    def finish(self, session: StudySession) -> StudySession:
        """Cierra la sesión. Idempotente a propósito.

        Se llama también al salir de la página, y ese camino puede dispararse
        dos veces; fallar ahí convertiría un cierre correcto en un error visible.
        """
        if session.is_active:
            session.finished_at = timezone.now()
            session.save(update_fields=['finished_at'])
        return session

    def _minutes(self, value: int, field: str) -> timedelta:
        if not MIN_MINUTES <= value <= MAX_MINUTES:
            raise ValidationError(
                {field: f"Tiene que estar entre {MIN_MINUTES} y {MAX_MINUTES} minutos."}
            )
        return timedelta(minutes=value)
