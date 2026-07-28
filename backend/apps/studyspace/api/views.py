from rest_framework.exceptions import ValidationError
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response 
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.studyspace.services.studyspace_service import StudyspaceService
from apps.studyspace.api.serializers import *

class StudyspaceViewSet(viewsets.ModelViewSet):
    
    permission_classes = [IsAuthenticated]
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = StudyspaceService(image_service=CloudinaryAdapter)
        
    def get_queryset(self):
        user = self.request.user
        
        # Delegamos todo lo que tenga que ver con models
        qs = self.service.get_user_studyspaces(user=user)
        
        # Optimizacion de la query

        if self.action == "retrieve":
            qs = qs.prefetch_related(
                "notes",
                "references",
                "sources",
                "tags",
            )

        else:
            qs = qs.only("id", "title", "created_at").prefetch_related("tags")
            
        return qs

    def get_serializer_class(self):
        if self.action in ['create', 'update', 'partial_update']:
            return StudyspaceCreateUpdateSerializer
        elif self.action == 'retrieve':
            return StudyspaceDetailSerializer
        return StudyspaceListSerializer
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        tags = data.pop('tags', [])
        
        studyspace = self.service.create_studyspace(data=data, user=request.user, tags=tags)
        
        return Response(StudyspaceDetailSerializer(studyspace).data, status=status.HTTP_201_CREATED)
    
    def update(self, request, *args, **kwargs):
        partial = kwargs.get('partial', False)
        studyspace = self.get_object()
        
        serializer = self.get_serializer(studyspace, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
         
        data = serializer.validated_data.copy()
        tags = data.pop('tags', [])
        
        studyspace = self.service.update_studyspace(data=data, studyspace=studyspace, tags=tags)
                
        return Response(StudyspaceListSerializer(studyspace).data, status=status.HTTP_200_OK)
    
    
class NoteViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = StudyspaceService(image_service=CloudinaryAdapter)
            
    def get_queryset(self):
        user = self.request.user
        
        # Delegamos todo lo que tenga que ver con models
        qs = self.service.get_user_notes(user=user)
        
        # Optimizacion de la query
        if self.action == "retrieve":
            qs = qs.prefetch_related(
                "images",
            )
            
        return qs
    
    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return NoteUpdateSerializer
        elif self.action == 'create':
            return NoteCreateSerializer
        elif self.action == 'retrieve':
            return NoteDetailSerializer
        return NoteMinimalSerializer
    
    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        images = data.pop('images', [])
        
        note = self.service.create_note(data=data, user=request.user, images=images)
        
        return Response(NoteDetailSerializer(note).data, status=status.HTTP_201_CREATED)
        
    def update(self, request, *args, **kwargs):
        partial = kwargs.get('partial', False)
        note = self.get_object()
        
        serializer = self.get_serializer(note=note, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
            
        data = serializer.validated_data.copy()
        new_images = data.pop('new_images', [])
        images_to_delete_ids = data.pop('images_to_delete_ids', [])
        
        note = self.service.update_note(data=data, note=note, new_images=new_images, images_to_delete_ids=images_to_delete_ids)
                
        return Response(NoteDetailSerializer(note).data, status=status.HTTP_200_OK)
            
    
            