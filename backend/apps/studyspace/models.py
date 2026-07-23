from django.db import models
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
    
    # Para el seguimiento de progreso (Ej: en qué página o segundo se quedó)
    last_position = models.FloatField(default=0) 
    updated_at = models.DateTimeField(auto_now=True)
    

class Annotation(models.Model):
    class AnnotationType(models.TextChoices):
        HIGHLIGHT = 'highlight', 'Highlight'
        NOTE = 'note', 'Text Note'

    source = models.ForeignKey(Source, related_name='annotations', on_delete=models.CASCADE)
    annotation_type = models.CharField(max_length=20, choices=AnnotationType.choices)
    
    # El contenido extraído o escrito
    content = models.TextField() 
    
    # Metadatos espaciales (Usando JSONField para guardar las coordenadas y la página)
    # Ej: {"page": 14, "rects": [{"x": 10, "y": 20, "w": 100, "h": 15}]}
    position_data = models.JSONField() 
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    
class Tag(models.Model):
    name = models.CharField()
    

class studyspaces_tags(models.Model):
    tag = models.ForeignKey(Tag, on_delete=models.CASCADE, related_name='studyspaces_tags')
    studyspace = models.ForeignKey(Studyspace, on_delete=models.CASCADE, related_name='studyspaces_tags')