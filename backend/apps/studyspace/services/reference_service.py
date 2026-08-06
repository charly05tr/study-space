from apps.studyspace.models import Reference
from apps.users.models import User


class ReferenceService:
    """La bibliografia de un studyspace: lo que se cita pero no se lee acá.

    Un Source es un archivo que se sube, se convierte y se anota. Una Reference
    es un puntero: el libro que no está en PDF, el paper detrás de un paywall,
    el video que se vio en otro lado. Por eso son dos tablas y no un Source sin
    archivo — la mitad de los campos de Source no aplicarían nunca.
    """

    def get_user_references(self, user: User):
        # El dueño de una referencia es el dueño de su studyspace.
        return (
            Reference.objects
            .filter(studyspace__user=user)
            # Sin orden explícito la lista queda a merced del que devuelva la
            # base, que no garantiza ninguno. La más nueva primero: se agregan
            # mientras se estudia, y la última es la que se está por leer.
            .order_by('-created_at')
        )
