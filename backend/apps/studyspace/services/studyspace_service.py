from django.core.files.uploadedfile import UploadedFile
from rest_framework.exceptions import ValidationError
from rest_framework import status
from apps.studyspace.models import Studyspace, Note, Tag, Source, NoteImage
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.users.models import User


class StudyspaceService:
    
    def __init__(self, image_service: CloudinaryAdapter):
        self.image=image_service
        
    def create_studyspace(self, data: dict, user: User, tags: list[str]) -> Studyspace:
        # Crear la instancia
        studyspace = Studyspace.objects.create(**data, user=user)
        
        # Guardar tags
        studyspace.tags.set(
            [Tag.objects.get_or_create(name=name)[0] for name in tags]
        )
        
        return studyspace
    
    def update_studyspace(self, data: dict, studyspace: Studyspace, tags: list[str]) -> Studyspace:
        # Actualizar datos
        for key, value in data.items():
            setattr(studyspace, key, value) 
        studyspace.save()
        
        # El cliente tiene que enviar todas las tags, las que no envien se eliminan
        studyspace.tags.set(
            [Tag.objects.get_or_create(name=name)[0] for name in tags]
        )
        
        return studyspace
        
    def get_user_studyspaces(self, user):
        return Studyspace.objects.filter(user=user)
    
    def create_note(self, data: dict, user: User, studyspace: Studyspace, images: UploadedFile) -> Note:  
        # Crear la note
        note = Note.objects.create(**data, studyspace=studyspace, user=user)
        
        # Subir imagenes
        for image in images:
            url = self.image.upload(image=image)
            NoteImage.objects.create(url=url, note=note, alt=f'Image of note #{note.id}')
        
        return note
    