from django.core.files.uploadedfile import UploadedFile
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.studyspace.models import Note, NoteImage, Studyspace
from apps.studyspace.services.block_service import BlockIndexService


class NoteService:

    def __init__(self, image_service: CloudinaryAdapter):
            self.image=image_service
            self.blocks = BlockIndexService()

    def get_user_notes(self, user):
        # Note no tiene FK a User: la pertenencia se hereda del studyspace.
        # Es el mismo salto que hace SourceService.get_user_sources.
        # El orden es explicito porque el ViewSet pagina, y paginar un queryset
        # sin orden puede repetir o saltear filas entre paginas.
        return Note.objects.filter(studyspace__user=user).order_by('-created_at')

    def create_note(self, data: dict, studyspace: Studyspace, images: list[UploadedFile]) -> Note:
        # Crear la note. El dueño no se pasa: lo define el studyspace, y la
        # vista ya verifico que ese studyspace sea de quien hace el request.
        note = Note.objects.create(**data, studyspace=studyspace)

        # Subir imagenes
        for image in images:
            url = self.image.upload(image=image)
            NoteImage.objects.create(url=url, note=note, alt=f'Image of note #{note.id}')

        # Una note nace vacia casi siempre, pero puede venir con contenido.
        self.blocks.sync(note)

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

        # Reproyectar el documento sobre el grafo. Sale enseguida si los bloques
        # no cambiaron, que es el caso de la mayoria de los autoguardados.
        self.blocks.sync(note)

        return note
    