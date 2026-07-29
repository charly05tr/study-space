from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response 
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.studyspace.services.studyspace_service import StudyspaceService
from apps.studyspace.api.serializers import *
from apps.studyspace.services.note_service import NoteService
from apps.studyspace.services.source_service import SourceService
from apps.studyspace.services.annotation_service import AnnotationService


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
        self.service = NoteService(image_service=CloudinaryAdapter)
        self.studyspace_service = StudyspaceService(image_service=CloudinaryAdapter)

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
        studyspace = data.pop('studyspace')

        # Sin esto se podria crear una note dentro del studyspace de otra cuenta
        # pasando su id: get_queryset filtra la lectura, no la escritura. Mismo
        # guard que AnnotationViewSet.perform_create.
        owned = self.studyspace_service.get_user_studyspaces(user=request.user)
        if not owned.filter(pk=studyspace.pk).exists():
            raise ValidationError("El studyspace no existe o no te pertenece.")

        note = self.service.create_note(data=data, studyspace=studyspace, images=images)

        return Response(NoteDetailSerializer(note).data, status=status.HTTP_201_CREATED)

    def update(self, request, *args, **kwargs):
        partial = kwargs.get('partial', False)
        note = self.get_object()

        # La instancia va posicional: `note=` no es un kwarg de serializer, DRF
        # lo reenvia a Field.__init__ y todo PATCH moria con TypeError.
        serializer = self.get_serializer(note, data=request.data, partial=partial)
        serializer.is_valid(raise_exception=True)
            
        data = serializer.validated_data.copy()
        new_images = data.pop('new_images', [])
        images_to_delete_ids = data.pop('images_to_delete_ids', [])
        
        note = self.service.update_note(data=data, note=note, new_images=new_images, images_to_delete_ids=images_to_delete_ids)
                
        return Response(NoteDetailSerializer(note).data, status=status.HTTP_200_OK)
            
    
class AnnotationViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    serializer_class = AnnotationSerializer
    filterset_fields = ['source', 'annotation_type']

    # El lector necesita TODAS las anotaciones de un source para poder pintarlas.
    # Con la paginacion global (PAGE_SIZE=10) solo se resaltarian las 10 primeras.
    pagination_class = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = AnnotationService()
        self.source_service = SourceService()

    def get_queryset(self):
        return self.service.get_user_annotations(user=self.request.user)

    def perform_create(self, serializer):
        # Sin esto se podria anotar el source de otra cuenta pasando su id:
        # el queryset filtra la lectura, no la escritura.
        source = serializer.validated_data['source']
        owned = self.source_service.get_user_sources(user=self.request.user)
        if not owned.filter(pk=source.pk).exists():
            raise ValidationError("La fuente no existe o no te pertenece.")

        serializer.instance = self.service.create_annotation(serializer.validated_data)


class SourceViewSet(viewsets.ModelViewSet):
    permission_classes = [IsAuthenticated]
    
    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = SourceService()
        self.studyspace_service = StudyspaceService(image_service=CloudinaryAdapter)

    def get_queryset(self):
        user = self.request.user

        # Delegamos todo lo que tenga que ver con models
        qs = self.service.get_user_sources(user=user)

        return qs

    def perform_create(self, serializer):
        # Sin esto se podria subir un archivo al studyspace de otra cuenta
        # pasando su id: get_queryset filtra la lectura, no la escritura.
        # Mismo guard que AnnotationViewSet.perform_create y NoteViewSet.create.
        studyspace = serializer.validated_data['study_space']
        owned = self.studyspace_service.get_user_studyspaces(user=self.request.user)
        if not owned.filter(pk=studyspace.pk).exists():
            raise ValidationError("El studyspace no existe o no te pertenece.")

        # save() y no create_source(): el titulo por defecto sale del nombre del
        # archivo dentro de SourceCreateSerializer.create.
        serializer.save()

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return SourceProgressUpdateSerializer
        elif self.action == 'create':
            return SourceCreateSerializer
        elif self.action == 'retrieve':
            return SourceSerializer
        return SourceMinimalSerializer
    
    @action(detail=True, methods=['post'], url_path='convert')
    def convert_source(self, request, pk=None):
        """Convierte y responde solo el estado.

        convert-pdf-to-html devuelve el HTML completo, que puede pesar decenas
        de MB. Para un boton de "convertir" eso seria descargar el libro entero
        para descartarlo.
        """
        sources = self.service.get_user_sources(user=request.user)
        source = get_object_or_404(sources, pk=pk)

        try:
            self.service.convert(source=source)
        except Exception as error:
            return Response(
                {"detail": f"The PDF could not be converted: {error}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'id': source.pk,
            'title': source.title,
            'is_converted': source.is_converted,
            'updated_at': source.updated_at,
        }, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='convert-pdf-to-html')
    def convert_pdf_to_html(self, request, pk=None):
        # 1. Obtenemos el queryset seguro del usuario
        sources = self.service.get_user_sources(user=request.user)
        
        # 2. Si no existe o no es de él, lanza un 404 automáticamente
        source = get_object_or_404(sources, pk=pk)
        
        # 3. Manejamos los errores de conversión elegantemente
        # get_reader_html devuelve el HTML ya guardado cuando fue generado con
        # la version actual del conversor. Llamar a convert() siempre reconvertia
        # el PDF entero en cada apertura, dejando sin uso el cache de
        # converted_with. ?force=true fuerza la reconversion.
        force = request.query_params.get('force', '').lower() in ('true', '1')

        try:
            if force:
                reader_html = self.service.convert(source=source)
            else:
                reader_html = self.service.get_reader_html(source=source)
        except Exception as error:
            return Response(
                {"detail": f"The PDF could not be converted: {error}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'title': source.title,
            'last_position': source.last_position,
            # Un documento se retoma por ancla, no por posicion: sin esto el
            # lector no puede volver al bloque donde quedo el usuario.
            'last_anchor': source.last_anchor,
            'reader_html': reader_html
        }, status=status.HTTP_200_OK)
        