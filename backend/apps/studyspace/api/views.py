from rest_framework.exceptions import ValidationError
from django.shortcuts import get_object_or_404
from rest_framework import mixins, viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response 
from apps.core.adapters.cloudinary_adapter import CloudinaryAdapter
from apps.studyspace.services import converters
from apps.studyspace.services.studyspace_service import StudyspaceService
from apps.studyspace.api.filters import (
    AnnotationFilter,
    BlockFilter,
    BlockLinkFilter,
    PlannedSessionFilter,
    ReferenceFilter,
    StudySessionFilter,
)
from apps.studyspace.api.serializers import *
from apps.studyspace.services.block_service import BlockIndexService
from apps.studyspace.services.concept_graph_service import ConceptGraphService
from apps.studyspace.services.note_service import NoteService
from apps.studyspace.services.reference_service import ReferenceService
from apps.studyspace.services.source_service import SourceService
from apps.studyspace.services.annotation_service import AnnotationService
from apps.studyspace.services.study_session_service import StudySessionService
from apps.studyspace.services.planned_session_service import PlannedSessionService


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

        # Editar entra por el mismo camino que ver: `update` escribe description
        # y responde el detalle completo, asi que la fila recortada de la lista
        # obligaria a Django a ir a buscar cada campo diferido de a uno.
        if self.action in ("retrieve", "update", "partial_update"):
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
    
    @action(detail=True, methods=['get'], url_path='graph')
    def graph(self, request, pk=None):
        """El mapa conceptual completo de un studyspace, en una sola request.

        Un nodo es un CONCEPTO, no un parrafo: el bloque que lo ancla mas todo lo
        que absorbio. El por que esta en `assign_concepts`, en block_service.

        No usa /blocks/ ni /block-links/ a proposito: aquel busca para el menu
        `[[`, topea en 50 resultados y esconde los huerfanos. El grafo necesita
        exactamente lo contrario, y pedir las dos mitades por separado dejaria
        una ventana donde las aristas apuntan a nodos que todavia no llegaron.
        """
        owned = self.service.get_user_studyspaces(user=request.user)
        studyspace = get_object_or_404(owned, pk=pk)

        graph_service = ConceptGraphService()

        nodes = list(graph_service.nodes(studyspace))
        node_ids = {str(node.pk) for node in nodes}

        # Las aristas se resuelven CONTRA el conjunto de nodos ya calculado, y no
        # con un filtro paralelo. Eran dos consultas independientes, asi que todo
        # lo que una escondia y la otra no dejaba aristas apuntando a un extremo
        # que nunca llegaba al cliente.
        edges = graph_service.edges(studyspace, node_ids)

        return Response({
            'nodes': GraphNodeSerializer(
                nodes,
                many=True,
                context={'previews': graph_service.previews(studyspace, node_ids)},
            ).data,
            'edges': GraphEdgeSerializer(edges, many=True).data,
        })

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
        # None y no []: un PATCH que no menciona las tags no las tiene que
        # tocar. Con [] como default, corregir un titulo desde el detalle
        # borraba todas las etiquetas del espacio sin pedirlo.
        tags = data.pop('tags', None)

        studyspace = self.service.update_studyspace(data=data, studyspace=studyspace, tags=tags)

        # El detalle y no la lista: quien edita esta parado en la pagina del
        # studyspace, y la lista no trae ni la descripcion que acaba de escribir.
        return Response(StudyspaceDetailSerializer(studyspace).data, status=status.HTTP_200_OK)
    
    
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
    filterset_class = AnnotationFilter

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


class ReferenceViewSet(viewsets.ModelViewSet):
    """La bibliografia de un studyspace: agregar, corregir, sacar.

    Se escribe entera desde acá y no desde el studyspace: una cita se agrega
    mientras se estudia, de a una, y meterlas dentro del PATCH del espacio
    obligaria a reenviar la lista completa para cambiarle el autor a una sola.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = ReferenceSerializer
    filterset_class = ReferenceFilter

    # La pagina de detalle ya trae las references adentro del studyspace; esta
    # lista existe para leer la bibliografia de un espacio completa, y cortarla
    # en 10 con la paginacion global la dejaria a medias.
    pagination_class = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = ReferenceService()
        self.studyspace_service = StudyspaceService(image_service=CloudinaryAdapter)

    def get_queryset(self):
        return self.service.get_user_references(user=self.request.user)

    def _assert_owned_studyspace(self, serializer):
        """Sin esto se podria citar dentro del studyspace de otra cuenta.

        get_queryset filtra la lectura, no la escritura. Mismo guard que
        NoteViewSet.create y AnnotationViewSet.perform_create.

        En un PATCH el campo puede no venir: ahi no hay nada que validar, la
        referencia se queda en el espacio que ya tenia.
        """
        studyspace = serializer.validated_data.get('studyspace')
        if studyspace is None:
            return

        owned = self.studyspace_service.get_user_studyspaces(user=self.request.user)
        if not owned.filter(pk=studyspace.pk).exists():
            raise ValidationError("El studyspace no existe o no te pertenece.")

    def perform_create(self, serializer):
        self._assert_owned_studyspace(serializer)
        serializer.save()

    def perform_update(self, serializer):
        # Tambien al editar: mover una referencia es elegir un studyspace nuevo,
        # y ese destino se valida igual que el de la creacion.
        self._assert_owned_studyspace(serializer)
        serializer.save()


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
            return SourceUpdateSerializer
        elif self.action == 'progress':
            return SourceProgressUpdateSerializer
        elif self.action == 'create':
            return SourceCreateSerializer
        elif self.action == 'retrieve':
            return SourceSerializer
        return SourceMinimalSerializer

    @action(detail=True, methods=['patch'], url_path='progress')
    def progress(self, request, pk=None):
        """El autoguardado de la posicion de lectura.

        Ruta propia y no el PATCH del recurso, que es lo que el nombre de
        SourceProgressUpdateSerializer viene diciendo desde siempre. Son dos
        escrituras de naturaleza distinta: esta la manda el lector solo, muchas
        veces por minuto mientras se scrollea, y renombrar es una decision que
        alguien toma una vez. Compartir endpoint obligaba a elegir cual de las
        dos podia escribir, y el progreso habia ganado — por eso hasta ahora el
        titulo de una fuente no se podia corregir desde ningun lado.
        """
        source = self.get_object()

        # partial siempre: el lector manda la posicion, el ancla, o las dos,
        # segun el medio. Un documento se retoma por ancla y un video por segundo.
        serializer = self.get_serializer(source, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()

        return Response(serializer.data, status=status.HTTP_200_OK)


    @action(detail=True, methods=['post'], url_path='convert')
    def convert_source(self, request, pk=None):
        """Convierte y responde solo el estado.

        convert-pdf-to-html devuelve el HTML completo, que puede pesar decenas
        de MB. Para un boton de "convertir" eso seria descargar el libro entero
        para descartarlo.
        """
        sources = self.service.get_user_sources(user=request.user)
        source = get_object_or_404(sources, pk=pk)

        # Ausente = se reconvierte con el conversor que ya tenia la fuente.
        mode = request.data.get('mode')
        if mode is not None and not converters.is_known(mode):
            raise ValidationError(f"Conversor desconocido: {mode}.")

        try:
            self.service.convert(source=source, mode=mode)
        except Exception as error:
            return Response(
                {"detail": f"The PDF could not be converted: {error}"},
                status=status.HTTP_400_BAD_REQUEST
            )

        return Response({
            'id': source.pk,
            'title': source.title,
            'is_converted': source.is_converted,
            'converter_mode': source.converter_mode,
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
            # A que espacio de estudio pertenece. El lector lo necesita para
            # saber si hay una sesion de estudio abierta: el temporizador se
            # abre por studyspace, no por fuente, y sin esto habria que pedir
            # el source entero de nuevo solo para leerle la clave foranea.
            'study_space': source.study_space_id,
            # El lector aplica la tipografia distinto segun el conversor: uno
            # escala el cuerpo de letra, el otro hace zoom sobre la pagina.
            'converter_mode': source.converter_mode,
            'last_position': source.last_position,
            # Un documento se retoma por ancla, no por posicion: sin esto el
            # lector no puede volver al bloque donde quedo el usuario.
            'last_anchor': source.last_anchor,
            'reader_html': reader_html
        }, status=status.HTTP_200_OK)
        

class StudySessionViewSet(
    mixins.CreateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.ReadOnlyModelViewSet,
):
    """Sesiones de estudio: empezar, contar ciclos, cerrar, y el historial.

    Sin update: una sesion terminada es un registro de lo que paso, y la unica
    escritura legitima mientras corre -- sumar un pomodoro -- tiene su propia
    accion porque el servidor la incrementa, no la recibe.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = StudySessionSerializer
    filterset_class = StudySessionFilter

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = StudySessionService()
        self.studyspace_service = StudyspaceService(image_service=CloudinaryAdapter)

    def get_queryset(self):
        return self.service.get_user_sessions(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'create':
            return StudySessionCreateSerializer
        return StudySessionSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Sin esto se podria abrir una sesion en el studyspace de otra cuenta
        # pasando su id: get_queryset filtra la lectura, no la escritura. Mismo
        # guard que NoteViewSet.create y AnnotationViewSet.perform_create.
        studyspace = data['studyspace']
        owned = self.studyspace_service.get_user_studyspaces(user=request.user)
        if not owned.filter(pk=studyspace.pk).exists():
            raise ValidationError("El studyspace no existe o no te pertenece.")

        session = self.service.start(
            studyspace=studyspace,
            goal=data['goal'],
            focus_minutes=data['focus_minutes'],
            rest_minutes=data['rest_minutes'],
        )

        return Response(
            StudySessionSerializer(session).data,
            status=status.HTTP_201_CREATED,
        )

    @action(detail=True, methods=['post'], url_path='complete-pomodoro')
    def complete_pomodoro(self, request, pk=None):
        session = self.service.complete_pomodoro(session=self.get_object())
        return Response(StudySessionSerializer(session).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='finish')
    def finish(self, request, pk=None):
        session = self.service.finish(session=self.get_object())
        return Response(StudySessionSerializer(session).data, status=status.HTTP_200_OK)


class PlannedSessionViewSet(
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.ReadOnlyModelViewSet,
):
    """Bloques de estudio planificados: el calendario del studyspace.

    Con update, al reves que StudySessionViewSet: un plan es una intencion, y
    una intencion se cambia de opinion. Lo que no se puede cambiar desde afuera
    es el estado ni el enlace con la sesion real -- esas transiciones las hace
    el servicio, porque "arrancar algo cancelado" tiene que ser imposible y no
    solo improbable.
    """

    permission_classes = [IsAuthenticated]
    serializer_class = PlannedSessionSerializer
    filterset_class = PlannedSessionFilter
    # El recorte ya lo hace el rango de fechas: el calendario pide exactamente
    # el mes que dibuja. Paginar eso de a diez seria devolver media grilla, y el
    # cliente no tendria forma de saber que le falta la otra mitad. Mismo
    # criterio que BlockViewSet y ReferenceViewSet.
    pagination_class = None

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.service = PlannedSessionService()
        self.studyspace_service = StudyspaceService(image_service=CloudinaryAdapter)

    def get_queryset(self):
        return self.service.get_user_planned_sessions(user=self.request.user)

    def get_serializer_class(self):
        if self.action == 'create':
            return PlannedSessionCreateSerializer
        if self.action in ('update', 'partial_update'):
            return PlannedSessionUpdateSerializer
        if self.action == 'start':
            return PlannedSessionStartSerializer
        return PlannedSessionSerializer

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # get_queryset filtra la lectura, no la escritura: sin este guard se
        # podria agendar en el studyspace de otra cuenta pasando su id. Mismo
        # chequeo que StudySessionViewSet.create.
        studyspace = data['studyspace']
        owned = self.studyspace_service.get_user_studyspaces(user=request.user)
        if not owned.filter(pk=studyspace.pk).exists():
            raise ValidationError("El studyspace no existe o no te pertenece.")

        plan = self.service.create(
            studyspace=studyspace,
            goal=data['goal'],
            starts_at=data['starts_at'],
            ends_at=data['ends_at'],
            timezone_name=data['timezone'],
            reminder_offset_minutes=data.get('reminder_offset_minutes', 60),
        )

        return Response(
            PlannedSessionSerializer(plan).data,
            status=status.HTTP_201_CREATED,
        )

    def update(self, request, *args, **kwargs):
        serializer = self.get_serializer(data=request.data, partial=kwargs.pop('partial', False))
        serializer.is_valid(raise_exception=True)

        plan = self.service.reschedule(self.get_object(), **serializer.validated_data)
        return Response(PlannedSessionSerializer(plan).data, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'], url_path='start')
    def start(self, request, pk=None):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        plan = self.get_object()
        session = self.service.start(
            plan=plan,
            focus_minutes=serializer.validated_data['focus_minutes'],
            rest_minutes=serializer.validated_data['rest_minutes'],
        )
        # Devuelve la sesion real y no el plan: el front que llama a esto va a
        # abrir el temporizador, y lo que el temporizador necesita es la sesion.
        return Response(StudySessionSerializer(session).data, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='cancel')
    def cancel(self, request, pk=None):
        plan = self.service.cancel(self.get_object())
        return Response(PlannedSessionSerializer(plan).data, status=status.HTTP_200_OK)


class BlockViewSet(mixins.UpdateModelMixin, viewsets.ReadOnlyModelViewSet):
    """El contenido nace del documento; solo su lugar en el mapa se edita.

    Escribir el texto o el tipo de un bloque aca lo pondria en desacuerdo con
    Note.content hasta el proximo guardado, que lo revertiria sin avisar. Los
    unicos campos escribibles son excluded_from_map y promoted, que son
    decisiones sobre el MAPA y que por eso la sincronizacion no toca.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = BlockSerializer
    filterset_class = BlockFilter
    # El buscador de `[[` necesita la lista completa de coincidencias, no una
    # pagina: navega con flechas y descarta a medida que escribe.
    pagination_class = None

    # Techo duro. Sin `q`, un studyspace grande devolveria miles de filas para
    # llenar un menu que muestra diez.
    MAX_RESULTS = 50

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.index_service = BlockIndexService()

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return BlockVisibilitySerializer
        return BlockSerializer

    def get_queryset(self):
        qs = Block.objects.filter(note__studyspace__user=self.request.user).select_related('note')

        # El buscador de `[[` solo ofrece bloques vivos y visibles; para cambiar
        # la visibilidad hay que poder alcanzar tambien los ya escondidos.
        if self.action in ['list', 'retrieve']:
            qs = qs.filter(deleted_at__isnull=True, excluded_from_map=False)

        return qs

    def list(self, request, *args, **kwargs):
        queryset = self.filter_queryset(self.get_queryset())[:self.MAX_RESULTS]
        return Response(self.get_serializer(queryset, many=True).data)

    def perform_update(self, serializer):
        """Promover o esconder un bloque redibuja los conceptos de su nota.

        Hay que pedirlo a mano: ninguno de los dos campos vive en Note.content,
        asi que la huella del documento no se mueve y `sync` cortaria antes de
        recalcular nada. Sin esto, promover un parrafo no lo pondria en el mapa
        hasta que el usuario volviera a escribir en la nota.
        """
        block = serializer.save()
        self.index_service.reassign_concepts(block.note)


class BlockLinkViewSet(viewsets.ModelViewSet):
    """Las aristas del mapa conceptual.

    Solo administra las de origin=graph. Las escritas con `[[` las gobierna el
    documento: borrarlas aca las devolveria el proximo guardado de la nota.
    """
    permission_classes = [IsAuthenticated]
    serializer_class = BlockLinkSerializer
    filterset_class = BlockLinkFilter
    pagination_class = None

    def get_queryset(self):
        return (
            BlockLink.objects
            .filter(source__note__studyspace__user=self.request.user)
            .select_related('source', 'target')
        )

    def __init__(self, **kwargs):
        super().__init__(**kwargs)
        self.index_service = BlockIndexService()

    def _owned_blocks(self):
        return Block.objects.filter(note__studyspace__user=self.request.user)

    def _reassign_ends(self, link):
        """Un huerfano ancla concepto propio solo mientras tenga relaciones.

        Asi que conectarlo puede ponerlo en el mapa y desconectarlo puede
        sacarlo, y en los dos casos hay que recalcular las dos notas: nada de
        esto pasa por el documento, asi que `sync` no se entera.
        """
        for note in {link.source.note_id: link.source.note, link.target.note_id: link.target.note}.values():
            self.index_service.reassign_concepts(note)

    def perform_create(self, serializer):
        # Sin esto se podria relacionar el bloque de otra cuenta pasando su id:
        # get_queryset filtra la lectura, no la escritura. Mismo guard que
        # AnnotationViewSet y NoteViewSet.
        owned = self._owned_blocks()
        for end in ('source', 'target'):
            block = serializer.validated_data[end]
            if not owned.filter(pk=block.pk).exists():
                raise ValidationError(f"El bloque de {end} no existe o no te pertenece.")

        # El origen lo decide el servidor: una arista creada por esta API se
        # dibujo en el mapa, y marcarla como inline la borraria el sync.
        link = serializer.save(origin=BlockLink.Origin.GRAPH)
        self._reassign_ends(link)

    def perform_destroy(self, instance):
        if instance.origin == BlockLink.Origin.INLINE:
            raise ValidationError(
                "Esa relacion esta escrita en la nota. Borrala desde el texto."
            )
        instance.delete()
        # Despues de borrar: el huerfano que se queda sin ninguna relacion deja
        # de ser un nodo, y es lo unico que lo sacaba del mapa.
        self._reassign_ends(instance)
