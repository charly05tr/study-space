from django_filters import rest_framework as filters

from apps.studyspace.models import Annotation


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
