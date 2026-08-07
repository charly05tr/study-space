from rest_framework import serializers
from apps.studyspace.models import (
    Studyspace, Note, Source, NoteImage, Annotation, Reference, Block, BlockLink,
    StudySession, PlannedSession,
)


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
        fields = ['id', 'title', 'source_type', 'is_converted', 'converter_mode']
        
        
class ReferenceSerializer(serializers.ModelSerializer):
    class Meta:
        model = Reference
        # Explícito y no "__all__": este serializer tambien escribe, y con
        # "__all__" cualquier campo que se le agregue al modelo mas adelante
        # queda editable desde la API sin que nadie lo haya decidido.
        fields = [
            'id',
            'url',
            'title',
            'reference_type',
            'authors',
            'publication_date',
            'studyspace',
            'created_at',
        ]
        read_only_fields = ['id', 'created_at']
        
        
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
        # studyspace es obligatorio: sin el la note no tiene a donde pertenecer
        # ni de quien heredar el dueño. La vista valida que sea del usuario.
        # content queda opcional (el modelo tiene default=dict) porque una note
        # nace vacia y se llena despues en el editor.
        fields = ['title', 'content', 'studyspace', 'images']
        
            
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
            'converter_mode',
            'last_position',
            'last_anchor',
            'updated_at'
        ]
        # Estos campos nunca deberían modificarse manualmente desde la API general.
        # converter_mode incluido: cambiarlo sin reconvertir dejaria el HTML
        # guardado describiendo un conversor que no lo genero.
        read_only_fields = [
            'id',
            'converted_file',
            'converter_mode',
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
    # El editor de notes muestra "de <fuente>, pagina N" al insertar una cita.
    # Sin esto tendria que pedir cada source por separado solo para el titulo.
    source_title = serializers.CharField(source='source.title', read_only=True)

    class Meta:
        model = Annotation
        fields = [
            'id',
            'source',
            'source_title',
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


class SourceUpdateSerializer(serializers.ModelSerializer):
    """Lo unico editable a mano de una fuente: como se llama.

    El archivo no. Reemplazarlo dejaria el HTML ya convertido, las anotaciones
    y sus anclas describiendo un documento que dejo de existir; para leer otra
    cosa se sube otra fuente. El titulo, en cambio, casi siempre nace del nombre
    del archivo — "Graciarena-LAINDUSTRIALIZACINCOMO-1983.pdf" — y ese es
    justamente el que hay que poder arreglar.
    """

    class Meta:
        model = Source
        fields = ['title']


class SourceProgressUpdateSerializer(serializers.ModelSerializer):
    """
    Serializer para el autoguardado de progreso (PATCH /sources/<id>/progress/).
    Solo expone los campos necesarios para retomar la lectura/video.
    """
    class Meta:
        model = Source
        fields = ['last_position', 'last_anchor']

class BlockSerializer(serializers.ModelSerializer):
    """Lo que el buscador de `[[` necesita para mostrar un bloque.

    Incluye el titulo de la nota porque un fragmento de texto suelto no dice de
    donde viene, y relacionar ideas ENTRE notas es el punto del grafo.
    """
    note_title = serializers.CharField(source='note.title', read_only=True)
    studyspace = serializers.IntegerField(source='note.studyspace_id', read_only=True)

    class Meta:
        model = Block
        fields = [
            'id', 'note', 'note_title', 'studyspace', 'block_type', 'text',
            'position', 'promoted',
        ]


class BlockVisibilitySerializer(serializers.ModelSerializer):
    """Lo unico de un Block que la API puede escribir.

    Los dos campos son decisiones del usuario SOBRE EL MAPA, no sobre la nota, y
    por eso son los unicos que la sincronizacion no pisa. `promoted` sube un
    bloque a concepto propio; `excluded_from_map` lo saca del mapa por completo.
    """

    class Meta:
        model = Block
        fields = ['id', 'excluded_from_map', 'promoted']
        read_only_fields = ['id']


class BlockLinkSerializer(serializers.ModelSerializer):
    source_text = serializers.CharField(source='source.text', read_only=True)
    target_text = serializers.CharField(source='target.text', read_only=True)
    # El grafo tiene que poder dibujar una arista huerfana distinta: apunta a un
    # bloque que ya no esta en ninguna nota.
    target_orphan = serializers.BooleanField(source='target.is_orphan', read_only=True)

    class Meta:
        model = BlockLink
        fields = [
            'id', 'source', 'target', 'source_text', 'target_text', 'target_orphan',
            'kind', 'origin', 'note', 'created_at',
        ]
        # Las aristas escritas en el texto las gobierna el documento: dejarlas
        # editar por la API las pondria en desacuerdo con el JSON hasta el
        # proximo guardado, que las revertiria sin avisar.
        read_only_fields = ['id', 'origin', 'created_at']


class GraphNodeSerializer(serializers.ModelSerializer):
    """Un CONCEPTO del mapa: el bloque que lo ancla, mas lo que absorbio.

    `text` es el del ancla — el titulo de la idea. `preview` es el arranque de su
    cuerpo, porque un heading como "Precios" no alcanza para reconocer de que
    hablaba sin abrir la nota.
    """
    note_title = serializers.CharField(source='note.title', read_only=True)
    # Bloque que ya no esta en ninguna nota. El grafo lo dibuja igual, apagado:
    # el parrafo se borro pero la relacion que el usuario penso sigue ahi.
    orphan = serializers.BooleanField(source='is_orphan', read_only=True)
    # Cuantos bloques viven adentro de la idea, contando el ancla. Es lo que
    # separa un titulo con tres parrafos abajo de uno que quedo vacio.
    block_count = serializers.IntegerField(read_only=True)
    preview = serializers.SerializerMethodField()

    class Meta:
        model = Block
        fields = [
            'id', 'note', 'note_title', 'block_type', 'text',
            'orphan', 'block_count', 'preview', 'promoted',
        ]

    def get_preview(self, block) -> str:
        return self.context.get('previews', {}).get(str(block.pk), '')


class GraphEdgeSerializer(serializers.Serializer):
    """Una arista entre conceptos. No es un BlockLink: es un grupo de ellos.

    Serializer plano y no ModelSerializer porque no hay modelo detras — el
    agrupado lo arma ConceptGraphService en memoria.
    """
    id = serializers.IntegerField(read_only=True)
    source = serializers.CharField(read_only=True)
    target = serializers.CharField(read_only=True)
    kind = serializers.CharField(read_only=True)
    origin = serializers.CharField(read_only=True)
    # Las relaciones reales que hay debajo. Borrar la arista es borrarlas todas.
    link_ids = serializers.ListField(child=serializers.IntegerField(), read_only=True)


def _to_minutes(duration) -> int:
    return round(duration.total_seconds() / 60)


class StudySessionSerializer(serializers.ModelSerializer):
    """Lectura de una sesion, para el temporizador y para el historial.

    Las duraciones viajan en MINUTOS y no como DurationField. El cliente las
    usa para dos cosas -- llenar un input numerico y armar un reloj -- y en las
    dos un entero es el dato; el formato "HH:MM:SS" de DRF obligaria al front a
    parsear una cadena para volver al mismo numero que el usuario escribio.
    """

    focus_minutes = serializers.SerializerMethodField()
    rest_minutes = serializers.SerializerMethodField()
    is_active = serializers.BooleanField(read_only=True)
    studyspace_title = serializers.CharField(source='studyspace.title', read_only=True)

    class Meta:
        model = StudySession
        fields = [
            'id',
            'goal',
            'studyspace',
            'studyspace_title',
            'focus_minutes',
            'rest_minutes',
            'completed_pomodoros',
            'is_active',
            'created_at',
            'finished_at',
        ]

    def get_focus_minutes(self, session) -> int:
        return _to_minutes(session.focus_time_duration)

    def get_rest_minutes(self, session) -> int:
        return _to_minutes(session.rest_time_duration)


class StudySessionCreateSerializer(serializers.Serializer):
    """Lo unico que se elige al empezar: que vas a hacer y con que ritmo.

    Serializer plano y no ModelSerializer: los dos campos de duracion no se
    escriben directo en el modelo, los arma el servicio a partir de minutos, y
    el rango valido es una regla de dominio que vive ahi.
    """

    goal = serializers.CharField(max_length=255)
    studyspace = serializers.PrimaryKeyRelatedField(queryset=Studyspace.objects.all())
    focus_minutes = serializers.IntegerField()
    rest_minutes = serializers.IntegerField()


class PlannedSessionSerializer(serializers.ModelSerializer):
    """Lectura de un bloque planificado, para pintar el calendario.

    `duration_minutes` viaja calculado y no se guarda: la duracion ES el
    intervalo entre las dos puntas, y mandar un tercer numero que pueda
    contradecirlas es invitar a que algun dia se contradigan.
    """

    studyspace_title = serializers.CharField(source='studyspace.title', read_only=True)
    duration_minutes = serializers.SerializerMethodField()

    class Meta:
        model = PlannedSession
        fields = [
            'id',
            'goal',
            'studyspace',
            'studyspace_title',
            'starts_at',
            'ends_at',
            'duration_minutes',
            'timezone',
            'reminder_offset_minutes',
            'reminder_sent_at',
            'status',
            'study_session',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['status', 'study_session', 'reminder_sent_at']

    def get_duration_minutes(self, plan) -> int:
        return round(plan.duration.total_seconds() / 60)


class PlannedSessionCreateSerializer(serializers.Serializer):
    """Lo que se elige al reservar un bloque: cuando, para que, y si avisar.

    Serializer plano y no ModelSerializer porque `reminder_at` es derivado y lo
    escribe el servicio; dejar que un ModelSerializer toque el modelo directo
    abriria la puerta a crear un plan con el recordatorio sin calcular.
    """

    goal = serializers.CharField(max_length=255)
    studyspace = serializers.PrimaryKeyRelatedField(queryset=Studyspace.objects.all())
    starts_at = serializers.DateTimeField()
    ends_at = serializers.DateTimeField()
    # El navegador la manda con Intl.DateTimeFormat().resolvedOptions().timeZone.
    timezone = serializers.CharField(max_length=64)
    # `null` explicito significa "sin recordatorio", que no es lo mismo que
    # omitir el campo -- por eso allow_null y un default aparte.
    reminder_offset_minutes = serializers.IntegerField(
        required=False, allow_null=True, default=60
    )


class PlannedSessionUpdateSerializer(serializers.Serializer):
    """Reprogramar: todo opcional, porque mover la hora y cambiar el objetivo
    son dos ediciones distintas que comparten endpoint."""

    goal = serializers.CharField(max_length=255, required=False)
    starts_at = serializers.DateTimeField(required=False)
    ends_at = serializers.DateTimeField(required=False)
    timezone = serializers.CharField(max_length=64, required=False)
    reminder_offset_minutes = serializers.IntegerField(
        required=False, allow_null=True
    )


class PlannedSessionStartSerializer(serializers.Serializer):
    """El ritmo se elige al arrancar, no al planificar."""

    focus_minutes = serializers.IntegerField()
    rest_minutes = serializers.IntegerField()
