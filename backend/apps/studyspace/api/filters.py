from django_filters import rest_framework as filters

from apps.studyspace.models import Annotation, Block, BlockLink, StudySession


class AnnotationFilter(filters.FilterSet):
    """Filtros de lectura para /annotations/.

    `studyspace` existe como filtro propio y no como `source__study_space`
    porque el editor de notes pide las anotaciones de todo un espacio de
    estudio, no las de un archivo: obligarlo a conocer el camino de relaciones
    del modelo seria filtrar el ORM desde el front.
    """

    studyspace = filters.NumberFilter(field_name='source__study_space')

    class Meta:
        model = Annotation
        fields = ['source', 'annotation_type', 'studyspace']


class BlockFilter(filters.FilterSet):
    """El buscador que se abre al escribir `[[`.

    `studyspace` y no `note`: se relacionan ideas ENTRE notas, asi que limitar
    la busqueda a la nota actual dejaria afuera justo el caso interesante.
    """

    studyspace = filters.NumberFilter(field_name='note__studyspace')
    q = filters.CharFilter(field_name='text', lookup_expr='icontains')

    class Meta:
        model = Block
        fields = ['studyspace', 'note', 'block_type', 'q']


class StudySessionFilter(filters.FilterSet):
    """El historial se lee por espacio de estudio.

    `active` es un filtro y no una ruta aparte porque la lista y la sesion
    abierta son la misma consulta con un recorte distinto: al abrir la pagina
    hay que saber si quedo algo corriendo antes de ofrecer empezar de nuevo.
    """

    active = filters.BooleanFilter(field_name='finished_at', lookup_expr='isnull')

    class Meta:
        model = StudySession
        fields = ['studyspace', 'active']


class BlockLinkFilter(filters.FilterSet):
    studyspace = filters.NumberFilter(field_name='source__note__studyspace')
    note = filters.NumberFilter(field_name='source__note')
    block = filters.CharFilter(method='touching_block')

    class Meta:
        model = BlockLink
        fields = ['studyspace', 'note', 'block', 'kind', 'origin']

    def touching_block(self, queryset, name, value):
        """Aristas que entran o salen del bloque.

        El vecindario de un nodo son las dos direcciones: quien lo cita importa
        tanto como a quien cita el.
        """
        from django.db.models import Q

        return queryset.filter(Q(source=value) | Q(target=value))
