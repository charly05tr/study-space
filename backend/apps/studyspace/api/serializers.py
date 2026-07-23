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
        
        
class NoteCreateUpdateSerializer(serializers.ModelSerializer):
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