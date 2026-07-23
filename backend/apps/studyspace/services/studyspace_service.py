from rest_framework.exceptions import ValidationError
from apps.studyspace.models import Studyspace, Note, Tag, Source
from backend.apps.users.models import User

class StudyspaceService:
    
    def __init__(self, image_service=None):
        self.image=image_service
        
    
    def create_studyspace(self, data: dict, user: User, tags: list[str]) -> Studyspace:
        # Crear la instancia
        studyspace = Studyspace.objects.create(**data, user=user)
        
        # Guardar tags
        studyspace.tags.set(
            [Tag.objects.get_or_create(name=name)[0] for name in tags]
        )
        
        return studyspace