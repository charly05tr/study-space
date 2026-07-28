from django.core.files.uploadedfile import UploadedFile
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.users.models import User
from apps.studyspace.models import Note, NoteImage, Studyspace


class NoteService:
    
    def __init__(self, image_service: CloudinaryAdapter):
            self.image=image_service
            
    def get_user_notes(self, user):
        return Note.objects.filter(user=user)
    
    def create_note(self, data: dict, user: User, studyspace: Studyspace, images: UploadedFile) -> Note:  
        # Crear la note
        note = Note.objects.create(**data, studyspace=studyspace, user=user)
        
        # Subir imagenes
        for image in images:
            url = self.image.upload(image=image)
            NoteImage.objects.create(url=url, note=note, alt=f'Image of note #{note.id}')
        
        return note
    
    def update_note(self, data: dict, note: Note, new_images: list[UploadedFile], images_to_delete_ids: list[int]) -> Studyspace:
        # Actualizar datos
        for key, value in data.items():
            setattr(note, key, value) 
        note.save()
        
        # Subir imagenes
        for image in new_images:
            url = self.image.upload(image=image)
            NoteImage.objects.create(url=url, note=note, alt=f'Image of note #{note.id}')
        
        # Eliminar imagenes
        for image_id in images_to_delete_ids:
            note_image = NoteImage.objects.filter(id=image_id).first()
            self.image.destroy(note_image.url)
            note_image.delete()
            
        return note
    