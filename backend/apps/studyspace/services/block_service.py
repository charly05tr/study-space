import hashlib
import json
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.studyspace.models import Block, BlockLink, Note

# Tipos de nodo de Tiptap que PUEDEN ser nodos del grafo. Es el mismo conjunto
# que ID_BEARING_BLOCKS en frontend/src/features/notes/editorExtensions.ts, pero
# no alcanza por si solo: extract_blocks todavia descarta los vacios y los
# contenedores. Un tipo que este alla y falte aca nunca se indexa.
INDEXED_TYPES = frozenset({
    'paragraph',
    'heading',
    'bulletList',
    'orderedList',
    'listItem',
    'codeBlock',
    'blockquote',
    'annotation',
})


# Nodo inline que el editor inserta al escribir `[[`. No es un bloque: vive
# DENTRO de uno, y es lo que convierte una mencion escrita en una arista.
LINK_NODE_TYPE = 'blockLink'


@dataclass(frozen=True)
class ExtractedBlock:
    id: str
    block_type: str
    text: str
    position: int


@dataclass(frozen=True)
class ExtractedLink:
    """Una arista escrita en el texto. El origen es el bloque que la contiene."""
    source_id: str
    target_id: str
    kind: str


def _node_text(node: dict) -> str:
    """Todo el texto que cuelga de un nodo, concatenado.

    Los dos casos especiales son atoms: no tienen hijos de texto, su contenido
    vive en attrs. Sin ellos una cita entraria al grafo sin etiqueta, y un
    parrafo cuyo unico contenido es una mencion `[[` contaria como vacio y se
    descartaria junto con la relacion que lleva adentro.
    """
    node_type = node.get('type')

    if node_type == 'annotation':
        return (node.get('attrs') or {}).get('content') or ''

    if node_type == LINK_NODE_TYPE:
        return (node.get('attrs') or {}).get('label') or ''

    if node_type == 'text':
        return node.get('text') or ''

    return ''.join(_node_text(child) for child in node.get('content') or [])


def extract_blocks(content: dict) -> list[ExtractedBlock]:
    """Recorre el documento en orden de lectura y devuelve sus bloques.

    Dos reglas deciden que entra al grafo, y las dos existen porque el ruido que
    sacan es ESTRUCTURAL, no culpa de quien escribe:

    1. Un bloque sin texto no entra. Tiptap deja un parrafo vacio al final de
       cada nota (TrailingNode), asi que sin esta regla el mapa arranca con un
       nodo mudo por nota, imposible de encontrar buscando y sin nada que decir.

    2. Solo entra el bloque indexable MAS INTERNO. Una lista de tres viñetas
       producia siete nodos: la lista, sus tres items y los tres parrafos que
       llevan adentro, los cuatro ultimos repitiendo el mismo texto. El texto de
       un contenedor es la suma del de sus hijos, asi que dibujarlo es dibujar
       lo mismo dos veces.

    Sigue siendo pura: no toca la base. Eso permite calcular la huella y
    compararla antes de decidir si vale la pena escribir algo.
    """
    if not isinstance(content, dict):
        return []

    keep: set[str] = set()

    def choose(node: dict) -> bool:
        """Post-orden: hay que saber que hay debajo antes de decidir el nodo."""
        indexed_below = False
        for child in node.get('content') or []:
            if choose(child):
                indexed_below = True

        block_id = (node.get('attrs') or {}).get('id')
        if (
            node.get('type') in INDEXED_TYPES
            and block_id
            and not indexed_below
            and _node_text(node).strip()
        ):
            keep.add(str(block_id))
            return True

        return indexed_below

    choose(content)

    blocks: list[ExtractedBlock] = []

    def collect(node: dict) -> None:
        """Pre-orden, para que `position` siga el orden de lectura."""
        block_id = (node.get('attrs') or {}).get('id')

        if block_id and str(block_id) in keep:
            blocks.append(ExtractedBlock(
                id=str(block_id),
                block_type=node.get('type') or '',
                text=_node_text(node).strip(),
                position=len(blocks),
            ))

        for child in node.get('content') or []:
            collect(child)

    collect(content)

    return blocks


def extract_links(content: dict) -> list[ExtractedLink]:
    """Las mencions `[[` del documento, atribuidas al bloque que las contiene.

    Se queda con el bloque indexado MAS INTERNO: un parrafo dentro de un item de
    lista es el origen razonable de la arista; la lista entera no dice nada.
    """
    links: list[ExtractedLink] = []

    def walk(node: dict, enclosing_id: str | None) -> None:
        block_id = (node.get('attrs') or {}).get('id')
        node_type = node.get('type')

        if node_type in INDEXED_TYPES and block_id:
            enclosing_id = str(block_id)

        if node_type == LINK_NODE_TYPE and enclosing_id:
            attrs = node.get('attrs') or {}
            target_id = attrs.get('targetId')
            if target_id:
                links.append(ExtractedLink(
                    source_id=enclosing_id,
                    target_id=str(target_id),
                    kind=attrs.get('kind') or BlockLink.Kind.RELATES,
                ))

        for child in node.get('content') or []:
            walk(child, enclosing_id)

    if isinstance(content, dict):
        walk(content, None)

    return links


def blocks_fingerprint(blocks: list[ExtractedBlock], links: list[ExtractedLink]) -> str:
    """Huella estable del conjunto de bloques, no del documento entero.

    Se calcula sobre lo que el indice guarda. Un cambio de formato que no altere
    ni el texto ni el orden no dispara reindexado.
    """
    payload = json.dumps(
        {
            'blocks': [[b.id, b.block_type, b.text, b.position] for b in blocks],
            # Las aristas entran en la huella: cambiar solo el tipo de una
            # relacion no mueve ningun bloque, y sin esto no se reindexaria.
            'links': sorted([link.source_id, link.target_id, link.kind] for link in links),
        },
        ensure_ascii=False,
        separators=(',', ':'),
    )
    return hashlib.sha256(payload.encode('utf-8')).hexdigest()


class BlockIndexService:
    """Mantiene la proyeccion de Note.content sobre Block.

    Idempotente a proposito: correrla dos veces seguidas no cambia nada, y se
    puede reconstruir el indice de cero sin tocar el documento.
    """

    def sync(self, note: Note, *, force: bool = False) -> bool:
        """Devuelve True si hubo algo que escribir."""
        content = note.content or {}
        blocks = extract_blocks(content)
        links = extract_links(content)
        fingerprint = blocks_fingerprint(blocks, links)

        if not force and fingerprint == note.blocks_hash:
            return False

        with transaction.atomic():
            self._upsert(note, blocks)
            self._retire_missing(note, {block.id for block in blocks})
            # Despues de los bloques: una arista recien escrita puede apuntar a
            # un bloque que se creo en este mismo guardado.
            self._reconcile_inline_links(note, links)

            note.blocks_hash = fingerprint
            # update_fields para no pisar content con la copia en memoria si el
            # llamador la modifico despues de leerla.
            note.save(update_fields=['blocks_hash'])

        return True

    def _reconcile_inline_links(self, note: Note, links: list[ExtractedLink]) -> None:
        """El documento manda sobre las aristas escritas en el, y solo sobre esas.

        Filtra por origin=INLINE a proposito: las relaciones dibujadas en el mapa
        no viven en el JSON, asi que reconciliar contra el documento las borraria
        todas en el primer guardado.
        """
        desired = {(link.source_id, link.target_id, link.kind) for link in links}

        current = BlockLink.objects.filter(
            source__note=note,
            origin=BlockLink.Origin.INLINE,
        )
        current_keys = {
            (str(link.source_id), str(link.target_id), link.kind) for link in current
        }

        removed = current_keys - desired
        if removed:
            for source_id, target_id, kind in removed:
                current.filter(source_id=source_id, target_id=target_id, kind=kind).delete()

        missing = desired - current_keys
        if not missing:
            return

        # Un objetivo puede no existir todavia: la nota de destino podria no
        # haberse indexado nunca. Se omite en vez de reventar, y la arista
        # aparece sola en el proximo guardado.
        known = set(
            Block.objects
            .filter(pk__in={target for _, target, _ in missing})
            .values_list('pk', flat=True)
        )
        known = {str(block_id) for block_id in known}

        BlockLink.objects.bulk_create(
            [
                BlockLink(
                    source_id=source_id,
                    target_id=target_id,
                    kind=kind,
                    origin=BlockLink.Origin.INLINE,
                )
                for source_id, target_id, kind in missing
                if target_id in known and target_id != source_id
            ],
            # Una misma arista puede estar escrita dos veces en el texto.
            ignore_conflicts=True,
        )

    def _upsert(self, note: Note, blocks: list[ExtractedBlock]) -> None:
        existing = {str(block.pk): block for block in Block.objects.filter(note=note)}

        to_create: list[Block] = []
        to_update: list[Block] = []

        for extracted in blocks:
            current = existing.get(extracted.id)

            if current is None:
                to_create.append(Block(
                    id=extracted.id,
                    note=note,
                    block_type=extracted.block_type,
                    text=extracted.text,
                    position=extracted.position,
                ))
                continue

            current.block_type = extracted.block_type
            current.text = extracted.text
            current.position = extracted.position
            # Un bloque que vuelve (deshacer, o pegar lo que se habia borrado)
            # revive junto con todas las relaciones que ya tenia.
            current.deleted_at = None
            to_update.append(current)

        if to_create:
            Block.objects.bulk_create(to_create)
        if to_update:
            Block.objects.bulk_update(
                to_update, ['block_type', 'text', 'position', 'deleted_at', 'updated_at']
            )

    def _retire_missing(self, note: Note, present_ids: set[str]) -> None:
        """Marca como huerfanos los bloques que ya no estan en el documento.

        No se borran: sus relaciones son lo que el usuario penso, y un parrafo
        borrado sin querer no deberia llevarse esa informacion.
        """
        (
            Block.objects
            .filter(note=note, deleted_at__isnull=True)
            .exclude(pk__in=present_ids)
            .update(deleted_at=timezone.now())
        )

    def rebuild_all(self) -> int:
        """Reconstruye el indice completo. Existe porque Block es derivado."""
        count = 0
        for note in Note.objects.iterator():
            if self.sync(note, force=True):
                count += 1
        return count

    def links_for_note(self, note: Note):
        """Las aristas que tocan algun bloque de la nota, en las dos direcciones.

        Las que salen y las que entran: para dibujar el vecindario de una nota
        importa igual quien la cita que a quien cita ella.
        """
        return (
            BlockLink.objects
            .filter(Q(source__note=note) | Q(target__note=note))
            .select_related('source', 'target')
        )
