import re
from datetime import timedelta

import fitz
from django.test import SimpleTestCase, TestCase
from rest_framework.exceptions import ValidationError
from rest_framework.test import APITestCase

from apps.studyspace.services import converters
from apps.studyspace.services.pdf_layout_service import (
    PT_TO_PX,
    _clean_style,
    pdf_to_layout_html,
)
from apps.studyspace.services.reader_anchors import BlockAnchors


def _pdf_bytes(pages):
    """A small PDF drawn from (text, colour) pairs, one page each."""
    document = fitz.open()
    for text, colour in pages:
        page = document.new_page(width=300, height=400)
        if text:
            page.insert_text((40, 60), text, fontsize=12, color=colour)
    return document.tobytes()


class BlockAnchorsTests(SimpleTestCase):
    def test_same_text_yields_same_anchor_across_instances(self):
        # This is what lets a highlight survive a reconversion.
        first = BlockAnchors().assign("El sistema operativo")
        second = BlockAnchors().assign("El sistema operativo")
        self.assertEqual(first, second)

    def test_whitespace_is_normalised_before_hashing(self):
        self.assertEqual(
            BlockAnchors().assign("  dos   palabras "),
            BlockAnchors().assign("dos palabras"),
        )

    def test_repeated_text_is_disambiguated_by_order(self):
        anchors = BlockAnchors()
        first = anchors.assign("Capitulo 1")
        second = anchors.assign("Capitulo 1")
        self.assertNotEqual(first, second)
        self.assertTrue(second.startswith(first))

    def test_blank_text_gets_no_anchor(self):
        self.assertIsNone(BlockAnchors().assign("   "))


class CleanStyleTests(SimpleTestCase):
    def test_drops_colour_and_keeps_geometry(self):
        cleaned = _clean_style("top:47.5pt;left:57.7pt;color:#231f20;line-height:10.0pt")
        self.assertEqual(cleaned, "top:47.5pt;left:57.7pt;line-height:10.0pt")

    def test_drops_background_declarations(self):
        self.assertEqual(_clean_style("background-color:#fff;top:1pt"), "top:1pt")

    def test_a_style_that_was_only_colour_becomes_empty(self):
        self.assertEqual(_clean_style("color:#000000"), "")

    def test_leaves_properties_whose_name_merely_contains_colour(self):
        self.assertEqual(_clean_style("border-color:#000"), "border-color:#000")


class LayoutConverterTests(SimpleTestCase):
    PAGES = [("Primera pagina", (1, 0, 0)), ("Segunda pagina", (0, 0, 1))]

    def setUp(self):
        self.html = pdf_to_layout_html(_pdf_bytes(self.PAGES), title="Prueba & Co")

    def test_marks_itself_as_layout_converted(self):
        # The reader switches how it applies typography on this attribute.
        self.assertIn('data-converter="layout"', self.html)

    def test_reports_the_page_width_in_css_pixels(self):
        width = re.search(r'data-page-width="(\d+)"', self.html)
        self.assertIsNotNone(width)
        self.assertEqual(int(width.group(1)), round(300 * PT_TO_PX))

    def test_one_pagina_per_pdf_page_numbered_from_one(self):
        self.assertIn('<div class="pagina" id="pagina-1"', self.html)
        self.assertIn('<div class="pagina" id="pagina-2"', self.html)
        self.assertNotIn('id="pagina-3"', self.html)

    def test_the_page_box_keeps_the_pdf_dimensions(self):
        self.assertIn("width:300.0pt;height:400.0pt", self.html)

    def test_every_line_carries_an_anchor_and_its_page(self):
        lines = re.findall(r'<p id="(b-[0-9a-f]+(?:-\d+)?)" data-pagina="(\d+)"', self.html)
        self.assertEqual(len(lines), 2)
        self.assertEqual([page for _, page in lines], ["1", "2"])

    def test_no_ink_colour_survives_into_the_body(self):
        # The whole point: the reader's --text-color has to be the only ink.
        body = self.html.split("<body>", 1)[1]
        self.assertNotIn("color:#", body)

    def test_pages_are_skipped_while_off_screen(self):
        # Load-bearing for the reader, not a cosmetic choice: without it a book
        # lays out tens of thousands of absolutely positioned lines at once.
        self.assertIn("content-visibility: auto", self.html)

    def test_the_page_box_carries_its_own_size(self):
        # What makes content-visibility exact here. Size containment sizes an
        # element as if it had no contents, so if these two ever stopped being
        # declared inline the pages would collapse to nothing while skipped.
        box = re.search(r'class="pagina"[^>]*style="([^"]*)"', self.html).group(1)
        self.assertIn("width:", box)
        self.assertIn("height:", box)

    def test_positions_are_kept(self):
        self.assertIn("top:", self.html)
        self.assertIn("left:", self.html)

    def test_the_title_is_escaped(self):
        self.assertIn("<title>Prueba &amp; Co</title>", self.html)

    def test_text_is_preserved_verbatim(self):
        self.assertIn("Primera pagina", self.html)
        self.assertIn("Segunda pagina", self.html)

    def test_conversion_is_deterministic(self):
        again = pdf_to_layout_html(_pdf_bytes(self.PAGES), title="Prueba & Co")
        self.assertEqual(self.html, again)

    def test_an_empty_page_still_produces_a_pagina(self):
        html = pdf_to_layout_html(_pdf_bytes([("", (0, 0, 0))]))
        self.assertIn('id="pagina-1"', html)


class StudySessionServiceTests(TestCase):
    def setUp(self):
        from apps.studyspace.models import Studyspace
        from apps.studyspace.services.study_session_service import StudySessionService
        from apps.users.models import User

        self.service = StudySessionService()
        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.other = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )

    def _start(self, goal="Leer el capitulo 2", focus=50, rest=10):
        return self.service.start(
            studyspace=self.studyspace, goal=goal, focus_minutes=focus, rest_minutes=rest
        )

    def test_minutes_are_stored_as_durations(self):
        session = self._start(focus=25, rest=5)
        self.assertEqual(session.focus_time_duration, timedelta(minutes=25))
        self.assertEqual(session.rest_time_duration, timedelta(minutes=5))

    def test_a_new_session_starts_open_and_empty(self):
        session = self._start()
        self.assertTrue(session.is_active)
        self.assertEqual(session.completed_pomodoros, 0)
        self.assertIsNone(session.finished_at)

    def test_a_second_session_cannot_open_while_one_is_running(self):
        # Dos abiertas a la vez no son dos sesiones: son una y una sin cerrar.
        self._start()
        with self.assertRaises(ValidationError):
            self._start(goal="Otra cosa")

    def test_a_new_session_opens_once_the_previous_one_is_closed(self):
        self.service.finish(self._start())
        self.assertTrue(self._start(goal="Segunda").is_active)

    def test_a_running_session_in_another_studyspace_does_not_block(self):
        from apps.studyspace.models import Studyspace

        self._start()
        other_space = Studyspace.objects.create(title="Redes", description="", user=self.user)
        self.assertIsNotNone(
            self.service.start(
                studyspace=other_space, goal="Capa 3", focus_minutes=25, rest_minutes=5
            )
        )

    def test_completing_a_pomodoro_counts_it(self):
        session = self._start()
        self.service.complete_pomodoro(session)
        self.service.complete_pomodoro(session)
        self.assertEqual(session.completed_pomodoros, 2)

    def test_a_second_tab_cannot_overwrite_the_count(self):
        # El contador lo incrementa la base. Con `session.completed + 1` esta
        # copia vieja escribiria 1 y borraria los otros dos ciclos.
        from apps.studyspace.models import StudySession

        session = self._start()
        stale = StudySession.objects.get(pk=session.pk)
        self.service.complete_pomodoro(session)
        self.service.complete_pomodoro(session)

        self.service.complete_pomodoro(stale)
        session.refresh_from_db()
        self.assertEqual(session.completed_pomodoros, 3)

    def test_a_closed_session_counts_nothing_more(self):
        session = self.service.finish(self._start())
        with self.assertRaises(ValidationError):
            self.service.complete_pomodoro(session)

    def test_finishing_is_idempotent(self):
        # Se llama tambien al salir de la pagina, y ese camino puede repetirse.
        session = self.service.finish(self._start())
        closed_at = session.finished_at
        self.assertEqual(self.service.finish(session).finished_at, closed_at)

    def test_durations_outside_the_supported_range_are_rejected(self):
        for focus, rest in ((0, 10), (50, 0), (181, 10), (50, 181), (-5, 10)):
            with self.subTest(focus=focus, rest=rest):
                with self.assertRaises(ValidationError):
                    self.service.start(
                        studyspace=self.studyspace,
                        goal="x",
                        focus_minutes=focus,
                        rest_minutes=rest,
                    )

    def test_a_rejected_duration_leaves_no_session_behind(self):
        from apps.studyspace.models import StudySession

        with self.assertRaises(ValidationError):
            self._start(focus=0)
        self.assertEqual(StudySession.objects.count(), 0)

    def test_sessions_are_scoped_to_their_owner(self):
        self._start()
        self.assertEqual(self.service.get_user_sessions(self.user).count(), 1)
        self.assertEqual(self.service.get_user_sessions(self.other).count(), 0)

    def test_history_reads_newest_first(self):
        first = self.service.finish(self._start(goal="Primera"))
        second = self._start(goal="Segunda")
        self.assertEqual(
            [s.pk for s in self.service.get_user_sessions(self.user)],
            [second.pk, first.pk],
        )

    def test_the_active_session_is_the_open_one(self):
        self.service.finish(self._start(goal="Cerrada"))
        running = self._start(goal="Abierta")
        self.assertEqual(self.service.active_session(self.studyspace), running)

    def test_there_is_no_active_session_once_everything_is_closed(self):
        self.service.finish(self._start())
        self.assertIsNone(self.service.active_session(self.studyspace))


class StudySessionApiTests(APITestCase):
    URL = '/api/study-sessions/'

    def setUp(self):
        from apps.studyspace.models import Studyspace
        from apps.users.models import User

        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )
        self.client.force_authenticate(self.user)

    def _start(self, **overrides):
        payload = {
            'goal': 'Leer el capitulo 2',
            'studyspace': self.studyspace.pk,
            'focus_minutes': 25,
            'rest_minutes': 5,
        }
        payload.update(overrides)
        return self.client.post(self.URL, payload, format='json')

    def test_starting_a_session_returns_it_in_minutes(self):
        response = self._start()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['focus_minutes'], 25)
        self.assertEqual(body['rest_minutes'], 5)
        self.assertTrue(body['is_active'])
        self.assertEqual(body['completed_pomodoros'], 0)

    def test_a_second_session_is_refused_while_one_runs(self):
        self._start()
        self.assertEqual(self._start(goal="Otra").status_code, 400)

    def test_minutes_outside_the_range_are_refused(self):
        self.assertEqual(self._start(focus_minutes=999).status_code, 400)

    def test_completing_a_pomodoro_is_counted_by_the_server(self):
        session = self._start().json()
        response = self.client.post(f"{self.URL}{session['id']}/complete-pomodoro/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['completed_pomodoros'], 1)

    def test_finishing_closes_the_session_and_can_repeat(self):
        session = self._start().json()
        first = self.client.post(f"{self.URL}{session['id']}/finish/")
        self.assertEqual(first.status_code, 200)
        self.assertFalse(first.json()['is_active'])
        self.assertIsNotNone(first.json()['finished_at'])

        # El front la cierra tambien al salir de la pagina, y ese camino repite.
        again = self.client.post(f"{self.URL}{session['id']}/finish/")
        self.assertEqual(again.status_code, 200)
        self.assertEqual(again.json()['finished_at'], first.json()['finished_at'])

    def test_a_closed_session_counts_nothing_more(self):
        session = self._start().json()
        self.client.post(f"{self.URL}{session['id']}/finish/")
        self.assertEqual(
            self.client.post(f"{self.URL}{session['id']}/complete-pomodoro/").status_code, 400
        )

    def test_the_active_filter_finds_only_the_open_one(self):
        session = self._start().json()
        query = {'studyspace': self.studyspace.pk, 'active': 'true'}
        self.assertEqual(self.client.get(self.URL, query).json()['count'], 1)

        self.client.post(f"{self.URL}{session['id']}/finish/")
        self.assertEqual(self.client.get(self.URL, query).json()['count'], 0)
        # Cerrada sigue en el historial: lo que desaparece es "la que corre".
        self.assertEqual(
            self.client.get(self.URL, {'studyspace': self.studyspace.pk}).json()['count'], 1
        )

    def test_a_session_is_not_editable(self):
        session = self._start().json()
        response = self.client.patch(
            f"{self.URL}{session['id']}/", {'goal': 'otra cosa'}, format='json'
        )
        self.assertEqual(response.status_code, 405)

    def test_another_account_neither_sees_nor_touches_the_sessions(self):
        from apps.users.models import User

        session = self._start().json()
        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.client.force_authenticate(intruder)

        self.assertEqual(
            self.client.get(self.URL, {'studyspace': self.studyspace.pk}).json()['count'], 0
        )
        self.assertEqual(
            self.client.post(f"{self.URL}{session['id']}/finish/").status_code, 404
        )
        # get_queryset filtra la lectura, no la escritura: sin el guard del
        # viewset se podria abrir una sesion en el espacio de otra cuenta.
        self.assertEqual(self._start(goal="ajeno").status_code, 400)

    def test_anonymous_requests_are_rejected(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.URL).status_code, 401)


class ColumnLayoutIndexingTests(SimpleTestCase):
    """El editor puede partir una nota en dos columnas; el mapa no debe notarlo.

    `columns` y `column` son maquetado: no estan en INDEXED_TYPES ni llevan id.
    Lo que importa es que el recorrido siga bajando por ellos, porque los
    parrafos que viven adentro son bloques reales del grafo.
    Ver frontend/src/features/notes/columnsNode.ts
    """

    def _document(self):
        return {
            'type': 'doc',
            'content': [
                {
                    'type': 'columns',
                    'content': [
                        {
                            'type': 'column',
                            'content': [
                                {
                                    'type': 'heading',
                                    'attrs': {'id': 'cue-head', 'level': 3},
                                    'content': [{'type': 'text', 'text': 'Ideas'}],
                                },
                                {
                                    'type': 'paragraph',
                                    'attrs': {'id': 'cue-body'},
                                    'content': [{'type': 'text', 'text': 'Por que hay paginacion'}],
                                },
                            ],
                        },
                        {
                            'type': 'column',
                            'content': [
                                {
                                    'type': 'paragraph',
                                    'attrs': {'id': 'note-body'},
                                    'content': [{'type': 'text', 'text': 'La MMU traduce'}],
                                },
                            ],
                        },
                    ],
                },
                {'type': 'horizontalRule'},
                {
                    'type': 'paragraph',
                    'attrs': {'id': 'summary'},
                    'content': [{'type': 'text', 'text': 'Resumen'}],
                },
            ],
        }

    def test_blocks_inside_columns_reach_the_index(self):
        from apps.studyspace.services.block_service import extract_blocks

        found = {block.id for block in extract_blocks(self._document())}
        self.assertEqual(found, {'cue-head', 'cue-body', 'note-body', 'summary'})

    def test_the_layout_containers_are_not_blocks_themselves(self):
        from apps.studyspace.services.block_service import extract_blocks

        types = {block.block_type for block in extract_blocks(self._document())}
        self.assertNotIn('columns', types)
        self.assertNotIn('column', types)

    def test_reading_order_runs_down_one_column_then_the_next(self):
        # Es el orden del documento, no el visual. Un mapa que numerara los
        # bloques cruzando de columna en columna no describiria ninguna nota.
        from apps.studyspace.services.block_service import extract_blocks

        blocks = extract_blocks(self._document())
        self.assertEqual(
            [block.id for block in blocks],
            ['cue-head', 'cue-body', 'note-body', 'summary'],
        )

    def test_a_mention_inside_a_column_belongs_to_its_own_paragraph(self):
        from apps.studyspace.services.block_service import extract_links

        document = self._document()
        column = document['content'][0]['content'][1]
        column['content'][0]['content'].append({
            'type': 'blockLink',
            'attrs': {'targetId': 'otro-bloque', 'label': 'MMU', 'kind': 'relates'},
        })

        links = extract_links(document)
        self.assertEqual(len(links), 1)
        # El contenedor no es origen valido: la arista nace del parrafo.
        self.assertEqual(links[0].source_id, 'note-body')
        self.assertEqual(links[0].target_id, 'otro-bloque')


class ConceptAssignmentTests(SimpleTestCase):
    """El reparto de bloques en conceptos. Puro, asi que no toca la base."""

    def _blocks(self, *specs):
        from apps.studyspace.services.block_service import ConceptInput

        return [
            ConceptInput(
                id=spec[0],
                block_type=spec[1],
                heading_level=spec[2] if len(spec) > 2 else None,
                promoted=spec[3] if len(spec) > 3 else False,
                excluded_from_map=spec[4] if len(spec) > 4 else False,
            )
            for spec in specs
        ]

    def test_a_heading_absorbs_the_paragraphs_under_it(self):
        # Es el cambio entero en una linea: tres parrafos bajo un titulo son UNA
        # idea, no cuatro nodos.
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('h', 'heading', 2),
            ('p1', 'paragraph'),
            ('p2', 'paragraph'),
        ))
        self.assertEqual(concepts, {'h': 'h', 'p1': 'h', 'p2': 'h'})

    def test_a_deeper_heading_opens_a_concept_inside_the_outer_one(self):
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('h2', 'heading', 2),
            ('under-h2', 'paragraph'),
            ('h3', 'heading', 3),
            ('under-h3', 'paragraph'),
        ))
        self.assertEqual(concepts['under-h2'], 'h2')
        self.assertEqual(concepts['under-h3'], 'h3')

    def test_a_heading_of_the_same_level_closes_the_previous_one(self):
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('first', 'heading', 2),
            ('h3', 'heading', 3),
            ('second', 'heading', 2),
            ('after', 'paragraph'),
        ))
        # Ni al h3 ni al primer h2: un titulo termina donde empieza el que sigue
        # a su mismo nivel.
        self.assertEqual(concepts['after'], 'second')

    def test_an_annotation_is_its_own_concept_but_absorbs_nothing(self):
        # Una cita es una idea cerrada, no un encabezado. Si se llevara los
        # parrafos de abajo, escribir debajo de una cita cambiaria de que habla.
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('h', 'heading', 2),
            ('quote', 'annotation'),
            ('after', 'paragraph'),
        ))
        self.assertEqual(concepts['quote'], 'quote')
        self.assertEqual(concepts['after'], 'h')

    def test_an_annotation_under_no_heading_still_reaches_the_map(self):
        # El caso que hace util el mapa: conectar lo que dice una fuente con lo
        # que dice otra. Absorberla en un titulo dejaria conectar capitulos.
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(('quote', 'annotation')))
        self.assertEqual(concepts['quote'], 'quote')

    def test_a_paragraph_with_no_heading_above_it_is_not_on_the_map(self):
        # Una nota sin un solo titulo no declara ningun concepto, y decirlo es
        # mas honesto que dibujar cada parrafo para que el usuario los borre.
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(('p', 'paragraph')))
        self.assertIsNone(concepts['p'])

    def test_promoting_a_paragraph_makes_it_a_concept_of_its_own(self):
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('h', 'heading', 2),
            ('plain', 'paragraph'),
            ('promoted', 'paragraph', None, True),
        ))
        self.assertEqual(concepts['plain'], 'h')
        self.assertEqual(concepts['promoted'], 'promoted')

    def test_a_promoted_paragraph_does_not_steal_the_blocks_after_it(self):
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('h', 'heading', 2),
            ('promoted', 'paragraph', None, True),
            ('after', 'paragraph'),
        ))
        self.assertEqual(concepts['after'], 'h')

    def test_a_hidden_heading_leaves_its_paragraphs_to_the_heading_above(self):
        # Esconder un titulo del mapa tiene que ser como si no estuviera escrito,
        # no como si cortara la nota en dos.
        from apps.studyspace.services.block_service import assign_concepts

        concepts = assign_concepts(self._blocks(
            ('h2', 'heading', 2),
            ('h3', 'heading', 3, False, True),
            ('under-h3', 'paragraph'),
        ))
        self.assertIsNone(concepts['h3'])
        self.assertEqual(concepts['under-h3'], 'h2')


class ConceptEdgeLiftingTests(SimpleTestCase):
    """Aristas: se leen entre ideas, no entre los parrafos que las escribieron."""

    def _lift(self, links, node_ids):
        from apps.studyspace.services.concept_graph_service import lift_edges

        return lift_edges(links, node_ids)

    def test_a_link_between_two_paragraphs_becomes_one_between_their_concepts(self):
        edges = self._lift(
            [(1, 'inflacion', 'precios', 'relates', 'inline')],
            {'inflacion', 'precios'},
        )
        self.assertEqual(len(edges), 1)
        self.assertEqual((edges[0].source, edges[0].target), ('inflacion', 'precios'))

    def test_two_links_inside_the_same_pair_collapse_into_one_edge(self):
        # Dos parrafos de un capitulo citando dos de otro son, entre ideas, UNA
        # conexion. Dibujarlas por separado seria contar el mismo pensamiento dos veces.
        edges = self._lift(
            [
                (1, 'inflacion', 'precios', 'relates', 'graph'),
                (2, 'inflacion', 'precios', 'relates', 'graph'),
            ],
            {'inflacion', 'precios'},
        )
        self.assertEqual(len(edges), 1)
        self.assertEqual(sorted(edges[0].link_ids), [1, 2])

    def test_a_collapsed_edge_keeps_a_stable_id(self):
        edges = self._lift(
            [
                (7, 'a', 'b', 'relates', 'graph'),
                (3, 'a', 'b', 'relates', 'graph'),
            ],
            {'a', 'b'},
        )
        self.assertEqual(edges[0].id, 3)

    def test_a_group_holding_an_inline_link_cannot_be_deleted_from_the_map(self):
        # Ofrecer el boton dejaria el trabajo a medias: la mitad inline vuelve
        # sola en el proximo guardado de la nota.
        edges = self._lift(
            [
                (1, 'a', 'b', 'relates', 'graph'),
                (2, 'a', 'b', 'relates', 'inline'),
            ],
            {'a', 'b'},
        )
        self.assertEqual(edges[0].origin, 'inline')

    def test_two_kinds_between_the_same_pair_stay_two_edges(self):
        edges = self._lift(
            [
                (1, 'a', 'b', 'relates', 'graph'),
                (2, 'a', 'b', 'contradicts', 'graph'),
            ],
            {'a', 'b'},
        )
        self.assertEqual(len(edges), 2)

    def test_a_link_inside_one_concept_is_not_an_edge(self):
        # Un parrafo citando a su vecino bajo el mismo titulo es una referencia
        # interna, no una conexion entre ideas.
        edges = self._lift([(1, 'misma', 'misma', 'relates', 'graph')], {'misma'})
        self.assertEqual(edges, [])

    def test_an_end_with_no_concept_drops_the_edge(self):
        edges = self._lift([(1, 'a', None, 'relates', 'graph')], {'a'})
        self.assertEqual(edges, [])

    def test_an_end_outside_the_node_set_drops_the_edge(self):
        # Lo que producia aristas colgando: el filtro de nodos y el de aristas
        # eran dos consultas distintas y no coincidian.
        edges = self._lift([(1, 'a', 'escondido', 'relates', 'graph')], {'a'})
        self.assertEqual(edges, [])


class ConverterRegistryTests(SimpleTestCase):
    def test_a_retired_converter_never_matches_a_stored_version(self):
        # 0 is the default of Source.converted_with, so no live converter may
        # report it either: a source that was never converted would read as
        # current and never be rebuilt.
        self.assertEqual(converters.version_of("removed-in-a-later-release"), 0)
        self.assertNotIn(0, converters.CONVERTER_VERSIONS.values())

    def test_unknown_modes_are_rejected(self):
        self.assertTrue(converters.is_known(converters.LAYOUT))
        self.assertFalse(converters.is_known("layout "))

    def test_known_modes_match_the_model_choices(self):
        from apps.studyspace.models import Source

        self.assertEqual(
            sorted(converters.CONVERTER_VERSIONS),
            sorted(mode for mode, _ in Source.ConverterMode.choices),
        )
