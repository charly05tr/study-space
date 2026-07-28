from apps.studyspace.models import Annotation
from apps.users.models import User


class AnnotationService:

    def get_user_annotations(self, user: User):
        # El dueno de una anotacion es el dueno del studyspace de su source.
        return (
            Annotation.objects
            .filter(source__study_space__user=user)
            # Sin orden explicito la paginacion y el pintado quedan a merced del
            # orden que devuelva Postgres, que no garantiza ninguno.
            .order_by('page', 'created_at')
        )

    def create_annotation(self, data: dict) -> Annotation:
        # 'anchor' repite el ancla del primer rango para poder filtrar por bloque
        # sin abrir el JSON al renderizar.
        ranges = data.get('ranges') or []
        if ranges and not data.get('anchor'):
            data['anchor'] = ranges[0].get('anchor', '')

        return Annotation.objects.create(**data)
