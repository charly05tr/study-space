from dataclasses import dataclass, field

from django.db.models import Count, F

from apps.studyspace.models import Block, BlockLink, Studyspace


@dataclass
class ConceptEdge:
    """Una arista entre dos CONCEPTOS, no entre dos parrafos.

    Guarda los `link_ids` que la produjeron porque varias relaciones distintas
    del documento pueden colapsar en la misma arista del mapa: dos parrafos del
    mismo capitulo citando dos parrafos de otro son, a nivel concepto, una sola
    conexion. Borrarla tiene que borrarlas todas o la arista reaparece sola.
    """
    source: str
    target: str
    kind: str
    origin: str
    link_ids: list[int] = field(default_factory=list)

    @property
    def id(self) -> int:
        """Identidad estable para el cliente: la relacion mas vieja del grupo.

        No sirve para borrar — para eso estan los `link_ids` — pero React
        necesita una key que no salte de lugar cada vez que se recarga el mapa.
        """
        return min(self.link_ids)


def lift_edges(rows, node_ids: set[str]) -> list[ConceptEdge]:
    """Sube cada relacion del bloque que la escribio al concepto que lo contiene.

    `rows` son tuplas (link_id, concepto_origen, concepto_destino, kind, origin).

    Es lo que hace que el mapa se lea al nivel de las ideas: si un parrafo bajo
    "Inflacion" cita otro bajo "Precios", lo que el usuario penso es que
    inflacion y precios estan relacionados. La arista entre los dos parrafos es
    el rastro de esa idea, no la idea.

    Tres cosas se caen aca, y las tres son correctas:

    - Punta sin concepto. El bloque existe pero no esta en el mapa, asi que la
      arista no tiene donde apoyarse.
    - Los dos extremos en el mismo concepto. Un parrafo citando a su vecino bajo
      el mismo titulo es una referencia interna, no una conexion entre ideas;
      dibujarla seria un rulo sobre el nodo.
    - Punta fuera del conjunto de nodos. Incluye las relaciones cruzadas a otro
      studyspace: el buscador de `[[` filtra por espacio desde el cliente, pero
      nada lo obliga del lado del servidor.

    Pura, para poder probar el agrupado sin una base de datos detras.
    """
    grouped: dict[tuple[str, str, str], ConceptEdge] = {}

    for link_id, source_concept, target_concept, kind, origin in rows:
        if not source_concept or not target_concept:
            continue

        source, target = str(source_concept), str(target_concept)
        if source == target:
            continue
        if source not in node_ids or target not in node_ids:
            continue

        key = (source, target, kind)
        edge = grouped.get(key)
        if edge is None:
            edge = ConceptEdge(source=source, target=target, kind=kind, origin=origin)
            grouped[key] = edge

        edge.link_ids.append(link_id)
        # Si CUALQUIERA de las relaciones agrupadas nacio en el texto, la arista
        # no se puede borrar desde el mapa: el proximo guardado de la nota la
        # devolveria. Decir 'graph' aca seria ofrecer un boton que deja el
        # trabajo a medias.
        if origin == BlockLink.Origin.INLINE:
            edge.origin = BlockLink.Origin.INLINE

    return list(grouped.values())


class ConceptGraphService:
    """Arma el mapa conceptual de un studyspace: nodos y aristas, ya elevados.

    Lee la proyeccion que dejo BlockIndexService. Toda la decision de que ES un
    concepto vive alla, en `assign_concepts`; aca solo se cosecha.
    """

    # Cuanto texto del cuerpo del concepto viaja para dar contexto. Un titulo
    # como "Precios" no dice nada por si solo, y abrir la nota para recordar de
    # que hablaba rompe el hilo de estar leyendo el mapa.
    PREVIEW_CHARS = 200

    def nodes(self, studyspace: Studyspace):
        """Los bloques que anclan un concepto, en orden de lectura.

        `concept_id=F('id')` es la definicion de ancla: se apunta a si mismo.
        Los que pertenecen al concepto de otro no son nodos, y los que tienen
        concept NULL no estan en el mapa.
        """
        return (
            Block.objects
            .filter(note__studyspace=studyspace, concept_id=F('id'))
            .select_related('note')
            # Incluye al ancla, asi que el minimo es 1. Es "cuantos bloques hay
            # adentro de esta idea", que es como se lee en la interfaz.
            .annotate(block_count=Count('members'))
            .order_by('note_id', 'position')
        )

    def previews(self, studyspace: Studyspace, node_ids: set[str]) -> dict[str, str]:
        """Primer bloque del cuerpo de cada concepto, recortado."""
        if not node_ids:
            return {}

        rows = (
            Block.objects
            .filter(note__studyspace=studyspace, concept_id__in=node_ids)
            # El ancla ya viaja como `text` del nodo; repetirla no agrega nada.
            .exclude(pk=F('concept_id'))
            .order_by('note_id', 'position')
            .values_list('concept_id', 'text')
        )

        found: dict[str, str] = {}
        for concept_id, text in rows:
            key = str(concept_id)
            if key not in found and text:
                found[key] = text[:self.PREVIEW_CHARS]
        return found

    def edges(self, studyspace: Studyspace, node_ids: set[str]) -> list[ConceptEdge]:
        """Las relaciones del studyspace, ya elevadas a nivel concepto.

        Pide las dos puntas dentro del espacio y deja el resto a `lift_edges`.
        """
        rows = (
            BlockLink.objects
            .filter(
                source__note__studyspace=studyspace,
                target__note__studyspace=studyspace,
            )
            .values_list('id', 'source__concept_id', 'target__concept_id', 'kind', 'origin')
        )
        return lift_edges(rows, node_ids)
