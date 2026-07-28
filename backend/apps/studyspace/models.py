from django.db import models
from django.db.models.signals import post_delete
from django.dispatch import receiver
from apps.users.models import User


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
    content = models.TextField()
    
    # Relations
    studyspace = models.ForeignKey(Studyspace, on_delete=models.CASCADE, related_name='notes')
    
    # Time
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    
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


    # El progreso se mide distinto según el medio: un audio o un video se retoman
    # en un segundo, un documento se retoma en un bloque del HTML convertido.
    # Son unidades distintas, por eso son dos campos y no uno compartido.
    last_position = models.FloatField(default=0)
    last_anchor = models.CharField(max_length=64, blank=True)

    updated_at = models.DateTimeField(auto_now=True)

    @property
    def is_converted(self) -> bool:
        """Hay HTML guardado y lo genero la version actual del conversor.

        Import local: services.pdf_service es pesado y solo hace falta al
        consultar esto, no al cargar el modelo.
        """
        from apps.studyspace.services.pdf_service import CONVERTER_VERSION

        return bool(self.converted_file) and self.converted_with == CONVERTER_VERSION


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
    # Ver BlockAnchors en apps/studyspace/services/pdf_service.py
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