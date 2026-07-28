from rest_framework import serializers
from apps.studyspace.models import Studyspace, Note, Source, NoteImage, Annotation, Reference


class StudyspaceCreateUpdateSerializer(serializers.ModelSerializer):
    tags = serializers.ListField(
        child=serializers.CharField(max_length=50),
        required=False,
    )
    
    class Meta:
        model = Studyspace
        fields = ['title', 'description', 'tags']
    
    
class StudyspaceListSerializer(serializers.ModelSerializer):
    tags = serializers.SlugRelatedField(
        many=True,
        read_only=True,
        slug_field="name",
    )
    
    class Meta:
        model = Studyspace  
        fields = ['id', 'title', 'tags', 'created_at']
        

class NoteMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Note
        fields = ['id', 'title']
        

class SourceMinimalSerializer(serializers.ModelSerializer):
    class Meta:
        model = Source
        fields = ['id', 'title', 'source_type']
        
        
class ReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reference
        fields = "__all__"
        
        
class StudyspaceDetailSerializer(serializers.ModelSerializer):
    tags = serializers.SlugRelatedField(
        many=True,
        read_only=True,
        slug_field="name",
    )
    
    notes = NoteMinimalSerializer(many=True, read_only=True)
    sources = SourceMinimalSerializer(many=True, read_only=True)
    references = ReferenceSerializer(many=True, read_only=True)
    
    class Meta:
        model = Studyspace  
        fields = ['id', 'title', 'description', 'user', 'created_at', 'updated_at', 'tags',
                  'notes', 'sources', 'references']
        
        
class NoteCreateSerializer(serializers.ModelSerializer):
    images = serializers.ListField(
        child=serializers.ImageField(),
        required=False
    )

    class Meta:
        model = Note
        fields = ['title', 'content', 'images']
        
            
class NoteUpdateSerializer(serializers.ModelSerializer):
    new_images = serializers.ListField(
        child=serializers.ImageField(),
        required=False
    )

    images_to_delete_ids = serializers.ListField(
        child=serializers.IntegerField(),
        required=False
    )
    
    class Meta:
        model = Note
        fields = ['title', 'content', 'new_images', 'images_to_delete_ids']
        

class NoteImageSerializer(serializers.ModelSerializer):
    class Meta:
        model = NoteImage
        fields = ['id', 'alt', 'url']
        
        
class NoteDetailSerializer(serializers.ModelSerializer):
    images = NoteImageSerializer(many=True, read_only=True)
    
    class Meta:
        model = Note
        fields = ['id', 'title', 'content', 'studyspace', 'created_at', 'updated_at', 'images']
        

class SourceSerializer(serializers.ModelSerializer):
    """
    Serializer de lectura general.
    Se usa para listar (GET /sources/) o ver el detalle de un source.
    """
    class Meta:
        model = Source
        fields = [
            'id', 
            'title', 
            'source_type', 
            'file', 
            'study_space',
            'converted_file', 
            'last_position', 
            'last_anchor', 
            'updated_at'
        ]
        # Estos campos nunca deberían modificarse manualmente desde la API general
        read_only_fields = [
            'id', 
            'converted_file', 
            'updated_at'
        ]


class SourceCreateSerializer(serializers.ModelSerializer):
    """
    Serializer exclusivo para la creación/subida (POST /sources/).
    Maneja las validaciones de tamaño y la asignación automática del título.
    """
    # Hacemos el título opcional en la API para poder inferirlo del archivo
    title = serializers.CharField(max_length=255, required=False)

    class Meta:
        model = Source
        fields = ['title', 'source_type', 'file', 'study_space']

    def validate_file(self, value):
        # Mantenemos la lógica de tu vista original de 50 MB
        MAX_UPLOAD_BYTES = 50 * 1024 * 1024  
        if value.size > MAX_UPLOAD_BYTES:
            raise serializers.ValidationError("El archivo supera el límite de 50 MB.")
        return value

    def create(self, validated_data):
        # Si el cliente no envía un título, usamos el nombre del archivo
        if 'title' not in validated_data:
            validated_data['title'] = validated_data['file'].name[:255]
            
        return super().create(validated_data)


class SourceProgressUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer para el autoguardado de progreso (PATCH /sources/<id>/progress/).
    Solo expone los campos necesarios para retomar la lectura/video.
    """
    class Meta:
        model = Source
        fields = ['last_position', 'last_anchor']