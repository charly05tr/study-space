from datetime import timedelta
from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from apps.users.models import User
from django.utils import timezone

"""Un Studyspace es un espacio de estudio, el cual consiste en un tema especifico, 
   donde se reunen notas, fuentes, pomodoro, space repetition, y como tal cubre todo 
   el proceso de aprendizaje, guias de estudio, ensayos, etc"""
class Studyspace(models.Model):
    # Meta Data
    title = models.CharField(max_length=200)
    description = models.CharField(max_length=1000)
    
    # Relations
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='studyspaces')
    
    tags = models.ManyToManyField('tag', related_name="studyspaces", blank=True)
    
    # Time
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

"""Las notes son las que hacen un studyspace, nacen de las sources, 
   crean relaciones entre ellas y se repasan en guias y ejercicios"""
class Note(models.Model):
    # Data
    title = models.CharField(max_length=200)
    content = models.JSONField(default=dict)

    # Huella de los bloques indexados la ultima vez. El autoguardado dispara una
    # vez por segundo de escritura; reindexar 200 bloques en cada uno seria
    # miles de escrituras por nota. Si la huella no cambio, no hay nada que
    # sincronizar. Cambiar una palabra SI la cambia, mover el cursor no.
    blocks_hash = models.CharField(max_length=64, blank=True, editable=False)

    # Relations
    studyspace = models.ForeignKey(Studyspace, on_delete=models.CASCADE, related_name='notes')
    
    # Time
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    
"""Un Block es un parrafo, titulo, item o cita de una Note, visto como nodo del grafo.

   Esta tabla es un INDICE DERIVADO, no la fuente de verdad: el documento sigue
   siendo Note.content. Se puede reconstruir entera desde el JSON en cualquier
   momento, y por eso un error de sincronizacion rompe el indice pero nunca el
   texto del usuario.

   Ver BlockIndexService en apps/studyspace/services/block_service.py"""
class Block(models.Model):
    # El UUID que la extension UniqueID ya escribio en Note.content. No se
    # genera una PK nueva: el id del JSON ES la identidad del bloque, y es lo
    # que sobrevive a que el usuario edite el texto.
    id = models.UUIDField(primary_key=True, editable=False)

    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='blocks')

    # Nombre del nodo de Tiptap: paragraph, heading, listItem, annotation...
    block_type = models.CharField(max_length=32)

    # Copia del texto del bloque. Desnormalizada para poder buscar y etiquetar
    # nodos del grafo sin abrir el JSON de cada nota.
    text = models.TextField(blank=True)

    # Orden dentro del documento, en recorrido de lectura.
    position = models.PositiveIntegerField()

    # Solo en los headings. Es lo que da forma al esquema de la nota, y por lo
    # tanto la frontera entre un concepto y el siguiente.
    heading_level = models.PositiveSmallIntegerField(null=True, blank=True)

    # Promovido a concepto a mano. Como excluded_from_map, lo decide el usuario y
    # la sincronizacion no lo toca: es la valvula de escape para el parrafo que
    # SI es una idea en si misma aunque no lleve un titulo propio.
    promoted = models.BooleanField(default=False)

    # El bloque que ancla el concepto al que este pertenece; a si mismo si el
    # ancla es el. Null significa que el bloque no esta en el mapa: existe en la
    # nota, se puede buscar y promover, pero no se dibuja.
    #
    # DERIVADO, como todo el resto de esta tabla: lo recalcula assign_concepts en
    # cada sincronizacion. No es una decision guardada, es una proyeccion del
    # esquema del documento.
    concept = models.ForeignKey(
        'self',
        null=True,
        blank=True,
        on_delete=models.SET_NULL,
        related_name='members',
    )

    # Borrado suave. Un bloque que desaparece de la nota NO se elimina: lo mas
    # valioso de la app no es el texto sino las relaciones que el usuario penso,
    # y borrar un parrafo sin querer no deberia llevarselas puestas.
    deleted_at = models.DateTimeField(null=True, blank=True)

    # Sacado del mapa a mano. NO es lo mismo que deleted_at: ese lo decide el
    # documento, este lo decide el usuario, y por eso la sincronizacion no lo
    # toca. Un parrafo vacio o un bloque que no aporta al grafo se esconde sin
    # tener que borrarlo de la nota, y sigue escondido despues de cada guardado.
    excluded_from_map = models.BooleanField(default=False)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['position']
        indexes = [
            models.Index(fields=['note', 'position']),
        ]
        # Sin indice propio para `concept`: es una ForeignKey, y Django ya le
        # pone db_index=True. Agregar otro seria mantener el mismo arbol dos veces.

    @property
    def is_orphan(self) -> bool:
        """El bloque ya no esta en la nota, pero sus relaciones siguen vivas."""
        return self.deleted_at is not None

    @property
    def is_concept(self) -> bool:
        """Ancla su propio concepto: es un nodo del mapa, no parte de uno."""
        return self.concept_id is not None and str(self.concept_id) == str(self.pk)


"""Una relacion dirigida entre dos blocks. Es la arista del mapa conceptual."""
class BlockLink(models.Model):
    class Kind(models.TextChoices):
        RELATES = 'relates', 'Relates to'
        SUPPORTS = 'supports', 'Supports'
        CONTRADICTS = 'contradicts', 'Contradicts'
        DEFINES = 'defines', 'Defines'
        EXAMPLE_OF = 'example_of', 'Example of'
        DERIVES_FROM = 'derives_from', 'Derives from'

    # Tipos donde el sentido de la flecha no aporta: la UI los dibuja sin punta
    # y el recorrido los toma en las dos direcciones.
    SYMMETRIC_KINDS = frozenset({Kind.RELATES, Kind.CONTRADICTS})

    class Origin(models.TextChoices):
        INLINE = 'inline', 'Written in the note'
        GRAPH = 'graph', 'Drawn in the map'

    source = models.ForeignKey(Block, on_delete=models.CASCADE, related_name='links_out')
    target = models.ForeignKey(Block, on_delete=models.CASCADE, related_name='links_in')

    kind = models.CharField(max_length=20, choices=Kind.choices, default=Kind.RELATES)

    # De donde nacio la arista. Sin esto, sincronizar una nota borraria todas
    # las relaciones dibujadas a mano en el mapa: el sync solo reconcilia las
    # 'inline', que son las unicas que viven en el JSON.
    origin = models.CharField(max_length=10, choices=Origin.choices, default=Origin.GRAPH)

    # El porque de la conexion. Es la mitad del valor de la arista.
    note = models.TextField(blank=True)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        constraints = [
            # Dos bloques pueden estar relacionados de varias formas distintas,
            # pero no dos veces de la misma.
            models.UniqueConstraint(
                fields=['source', 'target', 'kind'],
                name='unique_link_per_kind',
            ),
            models.CheckConstraint(
                condition=~models.Q(source=models.F('target')),
                name='block_link_not_self',
            ),
        ]
        indexes = [
            models.Index(fields=['source']),
            models.Index(fields=['target']),
        ]

    @property
    def is_symmetric(self) -> bool:
        return self.kind in self.SYMMETRIC_KINDS


class NoteImage(models.Model):
    # Data
    alt = models.CharField(null=True, blank=True)
    url = models.URLField()
    
    # Relation
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='images')
    
    
class Source(models.Model):
    class SourceType(models.TextChoices):
        PDF = 'pdf', 'PDF Document'
        VIDEO = 'mp4', 'Video'
        AUDIO = 'mp3', 'Audio'

    class ConverterMode(models.TextChoices):
        # Rebuilds the document as prose: reflows, scales with the font size,
        # but reinterprets the structure it reads.
        REFLOW = 'reflow', 'Reflowable text'
        # Reproduces every page where the PDF drew it. Looks like the original;
        # does not reflow, and vector graphics are not carried over.
        LAYOUT = 'layout', 'Faithful page layout'

    title = models.CharField(max_length=255)
    source_type = models.CharField(max_length=10, choices=SourceType.choices)
    file = models.FileField(upload_to='sources/')
    study_space = models.ForeignKey(Studyspace, on_delete=models.CASCADE, related_name='sources')

    # El HTML que lee el usuario. Se genera una sola vez: convertir un libro
    # entero es caro y el resultado es determinista para una misma versión del
    # conversor.
    converted_file = models.FileField(upload_to='sources/converted/', blank=True)

    # Con qué versión del conversor se generó. Sin esto, mejorar el conversor
    # no tendría efecto sobre las fuentes ya convertidas.
    converted_with = models.PositiveSmallIntegerField(default=0)

    # Qué conversor lo generó. Cada uno lleva su propia versión, así que sin
    # este campo un HTML fiel hecho con la v1 se leería como un reflow v1 ya
    # vigente y nunca se regeneraría.
    converter_mode = models.CharField(
        max_length=10,
        choices=ConverterMode.choices,
        default=ConverterMode.REFLOW,
    )


    # El progreso se mide distinto según el medio: un audio o un video se retoman
    # en un segundo, un documento se retoma en un bloque del HTML convertido.
    # Son unidades distintas, por eso son dos campos y no uno compartido.
    last_position = models.FloatField(default=0)
    last_anchor = models.CharField(max_length=64, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_converted(self) -> bool:
        """Hay HTML guardado y lo genero la version actual de SU conversor.

        El registro de conversores no importa PyMuPDF a proposito: esto se lee
        al serializar cada source de un studyspace.
        """
        from apps.studyspace.services.converters import version_of

        return (
            bool(self.converted_file)
            and self.converted_with == version_of(self.converter_mode)
        )


@receiver(post_delete, sender=Source)
def borrar_archivos_de_source(sender, instance, **kwargs):
    """Django no borra los archivos al borrar la fila, hay que hacerlo a mano.

    Se usa post_delete y no Source.delete() porque el borrado en cascada, como
    el de un Studyspace, no pasa por el método del modelo pero sí emite la señal.
    """
    for campo in (instance.file, instance.converted_file):
        if campo:
            campo.delete(save=False)


class Annotation(models.Model):
    class AnnotationType(models.TextChoices):
        HIGHLIGHT = 'highlight', 'Highlight'
        NOTE = 'note', 'Text Note'

    source = models.ForeignKey(Source, related_name='annotations', on_delete=models.CASCADE)
    annotation_type = models.CharField(max_length=20, choices=AnnotationType.choices)
    
    # El contenido extraído o escrito
    content = models.TextField()

    # Ubicación dentro del HTML convertido. Las coordenadas del PDF no sirven
    # acá: el HTML se reajusta al ancho de pantalla y al cuerpo de letra, así que
    # un x/y fijo deja de apuntar al mismo texto. El ancla se deriva del
    # contenido del bloque, por lo que sobrevive a reconvertir la fuente.
    # Ver BlockAnchors en apps/studyspace/services/reader_anchors.py
    anchor = models.CharField(max_length=64)

    # Página del PDF original. Se guarda desnormalizada para poder mostrar
    # "página 14" sin volver a convertir el documento.
    page = models.PositiveIntegerField()

    # Una selección puede cruzar varios bloques, así que el rango es una lista.
    # Ej: [{"anchor": "b-4cda0adf76", "start": 12, "end": 88}]
    # 'anchor' de arriba repite el del primer rango, para poder filtrar por
    # bloque sin abrir el JSON al renderizar una página.
    ranges = models.JSONField(default=list)

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            models.Index(fields=['source', 'anchor']),
        ]

    
class Tag(models.Model):
    name = models.CharField()
    
    
class Reference(models.Model):
    class ReferenceType(models.TextChoices):
        BOOK = "BOOK", "Book"
        BOOK_CHAPTER = "BOOK_CHAPTER", "Book Chapter"
        JOURNAL_ARTICLE = "JOURNAL_ARTICLE", "Journal Article"
        CONFERENCE_PAPER = "CONFERENCE_PAPER", "Conference Paper"
        THESIS = "THESIS", "Thesis"
        WEBSITE = "WEBSITE", "Website"
        VIDEO = "VIDEO", "Video"
        PODCAST = "PODCAST", "Podcast"
        DOCUMENTATION = "DOCUMENTATION", "Documentation"
        OTHER = "OTHER", "Other"
        
    url = models.URLField()
    title = models.CharField()
    reference_type = models.CharField(max_length=30, choices=ReferenceType.choices)
    authors = models.CharField(null=True, blank=True)
    publication_date = models.DateField(null=True, blank=True)
    
    studyspace = models.ForeignKey(Studyspace, on_delete=models.CASCADE, related_name='references')
    created_at = models.DateTimeField(auto_now_add=True)
    
    
class StudySession(models.Model):
    # Relaciones
    studyspace = models.ForeignKey('Studyspace', on_delete=models.CASCADE, related_name='study_sessions')
    
    # Metadatos
    goal = models.CharField(max_length=255)
    
    # Configuración de la técnica (Pomodoro)
    focus_time_duration = models.DurationField(default=timedelta(minutes=50))
    rest_time_duration = models.DurationField(default=timedelta(minutes=10))
    
    # Progreso de la sesión
    completed_pomodoros = models.PositiveIntegerField(default=0, help_text="Ciclos de focus completados exitosamente")
    
    # Trazabilidad temporal
    created_at = models.DateTimeField(auto_now_add=True)
    finished_at = models.DateTimeField(null=True, blank=True) 

    def __str__(self):
        return f"Sesión: {self.goal} ({self.created_at.strftime('%Y-%m-%d')})"

    @property
    def is_active(self):
        """Devuelve True si la sesión aún no ha sido marcada como finalizada."""
        return self.finished_at is None

    @property
    def total_duration(self):
        """Calcula el tiempo real invertido solo si la sesión ya terminó."""
        if self.finished_at:
            return self.finished_at - self.created_at
        return timezone.now() - self.created_at