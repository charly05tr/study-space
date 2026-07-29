import hashlib
import json
from dataclasses import dataclass

from django.db import transaction
from django.db.models import Q
from django.utils import timezone

from apps.studyspace.models import Block, BlockLink, Note

# Tipos de nodo de Tiptap que llevan un id y por lo tanto son nodos del grafo.
# Espeja ID_BEARING_BLOCKS en frontend/src/features/notes/editorExtensions.ts:
# si las dos listas se separan, aparecen bloques con id que nunca se indexan.
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


@dataclass(frozen=True)
class ExtractedBlock:
    id: str
    block_type: str
    text: str
    position: int


def _node_text(node: dict) -> str:
    """Todo el texto que cuelga de un nodo, concatenado.

    Una annotation es un atom: no tiene hijos de texto, la cita vive en sus
    attrs. Sin este caso especial las citas entrarian al grafo sin etiqueta.
    """
    if node.get('type') == 'annotation':
        return (node.get('attrs') or {}).get('content') or ''

    if node.get('type') == 'text':
        return node.get('text') or ''

    return ''.join(_node_text(child) for child in node.get('content') or [])


def extract_blocks(content: dict) -> list[ExtractedBlock]:
    """Recorre el documento en orden de lectura y devuelve sus bloques.

    Es pura: no toca la base. Eso permite calcular la huella y compararla antes
    de decidir si vale la pena escribir algo.
    """
    blocks: list[ExtractedBlock] = []

    def walk(node: dict) -> None:
        block_id = (node.get('attrs') or {}).get('id')
        node_type = node.get('type')

        if node_type in INDEXED_TYPES and block_id:
            blocks.append(ExtractedBlock(
                id=str(block_id),
                block_type=node_type,
                text=_node_text(node).strip(),
                position=len(blocks),
            ))

        # Se sigue bajando aunque el nodo ya se haya registrado: una lista es un
        # bloque y sus items tambien lo son.
        for child in node.get('content') or []:
            walk(child)

    if isinstance(content, dict):
        walk(content)

    return blocks


def blocks_fingerprint(blocks: list[ExtractedBlock]) -> str:
    """Huella estable del conjunto de bloques, no del documento entero.

    Se calcula sobre lo que el indice guarda. Un cambio de formato que no altere
    ni el texto ni el orden no dispara reindexado.
    """
    payload = json.dumps(
        [[block.id, block.block_type, block.text, block.position] for block in blocks],
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
        blocks = extract_blocks(note.content or {})
        fingerprint = blocks_fingerprint(blocks)

        if not force and fingerprint == note.blocks_hash:
            return False

        with transaction.atomic():
            self._upsert(note, blocks)
            self._retire_missing(note, {block.id for block in blocks})

            note.blocks_hash = fingerprint
            # update_fields para no pisar content con la copia en memoria si el
            # llamador la modifico despues de leerla.
            note.save(update_fields=['blocks_hash'])

        return True

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
