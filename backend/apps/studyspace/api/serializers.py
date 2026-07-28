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
    # Property del modelo: el front necesita saber si ya se puede leer o si
    # todavia hay que mandar a convertir.
    is_converted = serializers.BooleanField(read_only=True)

    class Meta:
        model = Source
        fields = ['id', 'title', 'source_type', 'is_converted']
        
        
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


class AnnotationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Annotation
        fields = [
            'id',
            'source',
            'annotation_type',
            'content',
            'anchor',
            'page',
            'ranges',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']

    def validate_ranges(self, value):
        """Cada rango necesita anchor/start/end: sin eso no se puede repintar."""
        if not isinstance(value, list) or not value:
            raise serializers.ValidationError("Se requiere al menos un rango.")

        for item in value:
            if not isinstance(item, dict):
                raise serializers.ValidationError("Cada rango debe ser un objeto.")

            missing = {'anchor', 'start', 'end'} - set(item)
            if missing:
                raise serializers.ValidationError(
                    f"Falta {', '.join(sorted(missing))} en un rango."
                )

            if not isinstance(item['start'], int) or not isinstance(item['end'], int):
                raise serializers.ValidationError("start y end deben ser enteros.")

            if item['start'] < 0 or item['end'] <= item['start']:
                raise serializers.ValidationError("Rango invalido: end debe ser mayor que start.")

        return value


class SourceProgressUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer para el autoguardado de progreso (PATCH /sources/<id>/progress/).
    Solo expone los campos necesarios para retomar la lectura/video.
    """
    class Meta:
        model = Source
        fields = ['last_position', 'last_anchor']