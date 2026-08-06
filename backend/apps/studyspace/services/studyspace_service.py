from django.core.files.uploadedfile import UploadedFile
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.users.models import User
from apps.studyspace.models import Studyspace, Tag


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
    
    def update_studyspace(
        self, data: dict, studyspace: Studyspace, tags: list[str] | None = None
    ) -> Studyspace:
        # Actualizar datos
        for key, value in data.items():
            setattr(studyspace, key, value)
        studyspace.save()

        # None no es lo mismo que []. Una lista vacia borra las tags a proposito;
        # None significa que el request ni las nombro, y pisarlas igual convertia
        # cada correccion de titulo en un borrado silencioso de etiquetas.
        if tags is not None:
            # El cliente tiene que enviar todas las tags, las que no envien se eliminan
            studyspace.tags.set(
                [Tag.objects.get_or_create(name=name)[0] for name in tags]
            )

        return studyspace
        
    def get_user_studyspaces(self, user) -> list[Studyspace]:
        return Studyspace.objects.filter(user=user).order_by('-created_at')
    