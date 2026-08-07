import re
import shutil
import tempfile
from datetime import timedelta
from uuid import uuid4

import fitz
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import SimpleTestCase, TestCase, override_settings
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


class PlannedSessionServiceTests(TestCase):
    """La planificacion: reservar el bloque, moverlo, y convertirlo en sesion."""

    def setUp(self):
        from django.utils import timezone as dj_timezone

        from apps.studyspace.models import Studyspace
        from apps.studyspace.services.planned_session_service import PlannedSessionService
        from apps.users.models import User

        self.now = dj_timezone.now()
        self.service = PlannedSessionService()
        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )

    def _plan(self, offset_hours=24, duration=timedelta(hours=2), **overrides):
        payload = {
            'studyspace': self.studyspace,
            'goal': "Leer el capitulo 2",
            'starts_at': self.now + timedelta(hours=offset_hours),
            'ends_at': self.now + timedelta(hours=offset_hours) + duration,
            'timezone_name': 'America/Managua',
            'reminder_offset_minutes': 60,
        }
        payload.update(overrides)
        return self.service.create(**payload)

    def test_the_reminder_instant_is_derived_from_the_block(self):
        # `reminder_at` no lo manda el cliente: se calcula, y por eso hay uno solo.
        plan = self._plan(offset_hours=24, reminder_offset_minutes=90)
        self.assertEqual(plan.reminder_at, plan.starts_at - timedelta(minutes=90))

    def test_no_reminder_leaves_nothing_to_sweep(self):
        plan = self._plan(reminder_offset_minutes=None)
        self.assertIsNone(plan.reminder_at)
        self.assertNotIn(plan, list(self.service.due_reminders(self.now + timedelta(days=2))))

    def test_the_past_is_not_plannable(self):
        with self.assertRaises(ValidationError):
            self._plan(offset_hours=-2)

    def test_a_block_must_end_after_it_starts(self):
        with self.assertRaises(ValidationError):
            self._plan(duration=timedelta(hours=-1))

    def test_absurd_durations_are_refused(self):
        with self.assertRaises(ValidationError):
            self._plan(duration=timedelta(minutes=1))
        with self.assertRaises(ValidationError):
            self._plan(duration=timedelta(hours=20))

    def test_an_unknown_timezone_is_refused(self):
        with self.assertRaises(ValidationError):
            self._plan(timezone_name='Mars/Olympus')

    def test_rescheduling_reopens_the_reminder(self):
        # Si ya se aviso y la sesion se mueve, el aviso viejo dejo de ser cierto.
        plan = self._plan()
        self.service.claim_reminder(plan)
        plan.refresh_from_db()
        self.assertIsNotNone(plan.reminder_sent_at)

        moved = self.service.reschedule(plan, starts_at=self.now + timedelta(days=3),
                                        ends_at=self.now + timedelta(days=3, hours=2))
        self.assertIsNone(moved.reminder_sent_at)
        self.assertEqual(moved.reminder_at, moved.starts_at - timedelta(minutes=60))

    def test_editing_only_the_goal_does_not_require_a_future_block(self):
        from apps.studyspace.models import PlannedSession

        plan = self._plan()
        PlannedSession.objects.filter(pk=plan.pk).update(
            starts_at=self.now - timedelta(hours=1),
            ends_at=self.now + timedelta(hours=1),
        )
        plan.refresh_from_db()

        edited = self.service.reschedule(plan, goal="Otro objetivo")
        self.assertEqual(edited.goal, "Otro objetivo")

    def test_cancelling_takes_it_out_of_the_sweep(self):
        plan = self.service.cancel(self._plan())
        self.assertIsNone(plan.reminder_at)
        self.assertNotIn(plan, list(self.service.due_reminders(self.now + timedelta(days=2))))

    def test_cancelling_twice_is_not_an_error(self):
        plan = self._plan()
        self.service.cancel(plan)
        self.service.cancel(plan)

    def test_starting_links_the_plan_to_a_real_session(self):
        from apps.studyspace.models import PlannedSession

        plan = self._plan()
        session = self.service.start(plan, focus_minutes=25, rest_minutes=5)

        plan.refresh_from_db()
        self.assertEqual(plan.status, PlannedSession.Status.STARTED)
        self.assertEqual(plan.study_session_id, session.pk)
        self.assertEqual(session.goal, plan.goal)
        # Una sesion ya iniciada no tiene recordatorio pendiente.
        self.assertIsNone(plan.reminder_at)

    def test_a_cancelled_plan_cannot_be_started(self):
        plan = self.service.cancel(self._plan())
        with self.assertRaises(ValidationError):
            self.service.start(plan, focus_minutes=25, rest_minutes=5)

    def test_a_started_plan_cannot_be_rescheduled(self):
        plan = self._plan()
        self.service.start(plan, focus_minutes=25, rest_minutes=5)
        with self.assertRaises(ValidationError):
            self.service.reschedule(plan, goal="tarde")

    def test_the_claim_is_won_exactly_once(self):
        # Dos barridos solapados no pueden mandar el mismo correo dos veces.
        plan = self._plan()
        self.assertTrue(self.service.claim_reminder(plan))
        self.assertFalse(self.service.claim_reminder(plan))

    def test_a_released_claim_returns_to_the_queue(self):
        plan = self._plan()
        self.service.claim_reminder(plan)
        self.service.release_reminder(plan)
        self.assertTrue(self.service.claim_reminder(plan))

    def test_a_reminder_is_useless_once_the_session_started(self):
        plan = self._plan()
        self.assertTrue(self.service.is_reminder_still_useful(plan, self.now))
        self.assertFalse(
            self.service.is_reminder_still_useful(plan, plan.starts_at + timedelta(hours=1))
        )

    def test_the_sweep_only_picks_what_is_due_and_unsent(self):
        due = self._plan(offset_hours=1)          # recordatorio ya vencido
        future = self._plan(offset_hours=48)      # todavia falta
        sent = self._plan(offset_hours=1)
        self.service.claim_reminder(sent)

        picked = set(self.service.due_reminders(self.now))
        self.assertIn(due, picked)
        self.assertNotIn(future, picked)
        self.assertNotIn(sent, picked)

    def test_the_email_reads_the_hour_it_was_planned_in(self):
        # El instante es absoluto; la zona guardada existe para el correo.
        plan = self._plan(timezone_name='America/Managua')
        self.assertEqual(str(self.service.local_starts_at(plan).tzinfo), 'America/Managua')

    def test_past_blocks_are_closed_as_missed(self):
        from apps.studyspace.models import PlannedSession

        plan = self._plan()
        PlannedSession.objects.filter(pk=plan.pk).update(
            starts_at=self.now - timedelta(hours=4),
            ends_at=self.now - timedelta(hours=2),
        )

        self.assertEqual(self.service.mark_missed(self.now), 1)
        plan.refresh_from_db()
        self.assertEqual(plan.status, PlannedSession.Status.MISSED)

    def test_other_peoples_plans_are_not_listed(self):
        from apps.users.models import User

        self._plan()
        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.assertEqual(self.service.get_user_planned_sessions(intruder).count(), 0)


@override_settings(
    EMAIL_BACKEND='django.core.mail.backends.locmem.EmailBackend',
    # Sin esto, `.delay()` del barrido encola contra el Redis real y el worker
    # de verdad termina buscando filas de la base de test.
    CELERY_TASK_ALWAYS_EAGER=True,
)
class SessionReminderTaskTests(TestCase):
    """El camino completo del recordatorio: barrido, envio, y plantilla.

    Las tareas se llaman directo y no con `.delay()`: lo que se prueba es la
    logica de la tarea, no que Celery sepa encolar.
    """

    def setUp(self):
        from django.utils import timezone as dj_timezone

        from apps.studyspace.models import Studyspace
        from apps.studyspace.services.planned_session_service import PlannedSessionService
        from apps.users.models import User

        self.now = dj_timezone.now()
        self.service = PlannedSessionService()
        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x",
            first_name="Carlos",
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )

    def _plan(self, offset_hours=1, **overrides):
        payload = {
            'studyspace': self.studyspace,
            'goal': "Leer el capitulo 2",
            'starts_at': self.now + timedelta(hours=offset_hours),
            'ends_at': self.now + timedelta(hours=offset_hours + 2),
            'timezone_name': 'America/Managua',
            'reminder_offset_minutes': 60,
        }
        payload.update(overrides)
        return self.service.create(**payload)

    def test_the_reminder_renders_and_reaches_the_owner(self):
        from django.core import mail

        from apps.studyspace.tasks import task_send_session_reminder

        plan = self._plan()
        task_send_session_reminder(plan.pk)

        self.assertEqual(len(mail.outbox), 1)
        sent = mail.outbox[0]
        self.assertEqual(sent.to, ['lector@example.com'])
        self.assertIn(plan.goal, sent.subject)
        # La plantilla vive en config/templates y solo resuelve dentro del
        # contenedor: si este assert pasa, el DIRS absoluto esta bien.
        self.assertIn("Sistemas operativos", sent.body)

        plan.refresh_from_db()
        self.assertIsNotNone(plan.reminder_sent_at)

    def test_the_same_reminder_is_not_sent_twice(self):
        from django.core import mail

        from apps.studyspace.tasks import task_send_session_reminder

        plan = self._plan()
        task_send_session_reminder(plan.pk)
        task_send_session_reminder(plan.pk)
        self.assertEqual(len(mail.outbox), 1)

    def test_a_cancelled_plan_gets_no_email(self):
        from django.core import mail

        from apps.studyspace.tasks import task_send_session_reminder

        plan = self.service.cancel(self._plan())
        task_send_session_reminder(plan.pk)
        self.assertEqual(len(mail.outbox), 0)

    def test_a_reminder_that_arrived_late_is_dropped_not_looped(self):
        from django.core import mail

        from apps.studyspace.models import PlannedSession
        from apps.studyspace.tasks import task_send_session_reminder

        # El broker estuvo caido y la sesion ya empezo: avisar ahora desinforma.
        plan = self._plan()
        PlannedSession.objects.filter(pk=plan.pk).update(
            starts_at=self.now - timedelta(hours=2),
            ends_at=self.now - timedelta(hours=1),
            reminder_at=self.now - timedelta(hours=3),
        )

        task_send_session_reminder(plan.pk)

        self.assertEqual(len(mail.outbox), 0)
        plan.refresh_from_db()
        # Marcado igual: sin esto el barrido lo levantaria para siempre.
        self.assertIsNotNone(plan.reminder_sent_at)

    def test_the_sweep_enqueues_only_what_is_due(self):
        from apps.studyspace.tasks import task_sweep_session_reminders

        self._plan(offset_hours=1)    # vence ahora
        self._plan(offset_hours=48)   # todavia falta
        self.assertEqual(task_sweep_session_reminders(), 1)

    def test_a_missing_plan_does_not_crash_the_worker(self):
        from apps.studyspace.tasks import task_send_session_reminder

        task_send_session_reminder(999999)


class PlannedSessionApiTests(APITestCase):
    URL = '/api/planned-sessions/'

    def setUp(self):
        from django.utils import timezone as dj_timezone

        from apps.studyspace.models import Studyspace
        from apps.users.models import User

        self.now = dj_timezone.now()
        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )
        self.client.force_authenticate(self.user)

    def _create(self, **overrides):
        starts = self.now + timedelta(days=1)
        payload = {
            'goal': 'Leer el capitulo 2',
            'studyspace': self.studyspace.pk,
            'starts_at': starts.isoformat(),
            'ends_at': (starts + timedelta(hours=2)).isoformat(),
            'timezone': 'America/Managua',
            'reminder_offset_minutes': 60,
        }
        payload.update(overrides)
        return self.client.post(self.URL, payload, format='json')

    def test_planning_a_block_returns_its_duration(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['duration_minutes'], 120)
        self.assertEqual(body['status'], 'planned')
        self.assertIsNone(body['study_session'])

    def test_a_block_in_the_past_is_refused(self):
        starts = self.now - timedelta(hours=3)
        response = self._create(
            starts_at=starts.isoformat(),
            ends_at=(starts + timedelta(hours=1)).isoformat(),
        )
        self.assertEqual(response.status_code, 400)

    def test_the_calendar_reads_a_date_range(self):
        self._create()
        far = self.now + timedelta(days=60)
        self._create(
            starts_at=far.isoformat(), ends_at=(far + timedelta(hours=1)).isoformat()
        )

        response = self.client.get(self.URL, {
            'studyspace': self.studyspace.pk,
            'starts_after': self.now.isoformat(),
            'starts_before': (self.now + timedelta(days=7)).isoformat(),
        })
        self.assertEqual(len(response.json()), 1)

    def test_the_calendar_is_not_paginated(self):
        # Un mes partido en dos paginas es media grilla, y el cliente no tendria
        # como saber que le falta la otra mitad.
        for day in range(1, 15):
            starts = self.now + timedelta(days=day)
            self._create(
                starts_at=starts.isoformat(),
                ends_at=(starts + timedelta(hours=1)).isoformat(),
            )

        response = self.client.get(self.URL, {'studyspace': self.studyspace.pk})
        self.assertEqual(len(response.json()), 14)

    def test_rescheduling_moves_the_block(self):
        plan = self._create().json()
        moved = self.now + timedelta(days=5)

        response = self.client.patch(f"{self.URL}{plan['id']}/", {
            'starts_at': moved.isoformat(),
            'ends_at': (moved + timedelta(hours=1)).isoformat(),
        }, format='json')

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['duration_minutes'], 60)

    def test_the_client_cannot_write_the_status(self):
        # El estado lo mueve el servicio; mandarlo por PATCH no debe hacer nada.
        plan = self._create().json()
        response = self.client.patch(
            f"{self.URL}{plan['id']}/", {'status': 'completed'}, format='json'
        )
        self.assertEqual(response.json()['status'], 'planned')

    def test_starting_returns_the_real_session(self):
        plan = self._create().json()
        response = self.client.post(
            f"{self.URL}{plan['id']}/start/",
            {'focus_minutes': 25, 'rest_minutes': 5},
            format='json',
        )

        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['focus_minutes'], 25)
        self.assertTrue(body['is_active'])

        plan_after = self.client.get(f"{self.URL}{plan['id']}/").json()
        self.assertEqual(plan_after['status'], 'started')
        self.assertEqual(plan_after['study_session'], body['id'])

    def test_cancelling_leaves_the_block_in_the_calendar(self):
        plan = self._create().json()
        response = self.client.post(f"{self.URL}{plan['id']}/cancel/")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['status'], 'cancelled')

    def test_another_account_neither_sees_nor_touches_the_plans(self):
        from apps.users.models import User

        plan = self._create().json()
        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.client.force_authenticate(intruder)

        self.assertEqual(
            len(self.client.get(self.URL, {'studyspace': self.studyspace.pk}).json()), 0
        )
        self.assertEqual(
            self.client.post(f"{self.URL}{plan['id']}/cancel/").status_code, 404
        )
        # Mismo guard que StudySessionViewSet: get_queryset filtra la lectura,
        # no la escritura.
        self.assertEqual(self._create(goal="ajeno").status_code, 400)

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


class ReferenceApiTests(APITestCase):
    URL = '/api/references/'

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

    def _create(self, **overrides):
        payload = {
            'studyspace': self.studyspace.pk,
            'title': 'Operating System Concepts',
            'url': 'https://example.com/osc',
            'reference_type': 'BOOK',
        }
        payload.update(overrides)
        return self.client.post(self.URL, payload, format='json')

    def test_a_reference_is_created_inside_its_studyspace(self):
        response = self._create()
        self.assertEqual(response.status_code, 201)
        body = response.json()
        self.assertEqual(body['studyspace'], self.studyspace.pk)
        self.assertEqual(body['reference_type'], 'BOOK')
        # Los dos opcionales del modelo llegan nulos, no ausentes: el front los
        # muestra condicionados a que tengan valor.
        self.assertIsNone(body['authors'])
        self.assertIsNone(body['publication_date'])

    def test_an_unknown_type_is_refused(self):
        self.assertEqual(self._create(reference_type='NEWSPAPER').status_code, 400)

    def test_a_reference_needs_a_valid_url(self):
        self.assertEqual(self._create(url='no-es-una-url').status_code, 400)

    def test_editing_leaves_the_rest_of_the_fields_alone(self):
        reference = self._create(authors='Silberschatz').json()

        response = self.client.patch(
            f"{self.URL}{reference['id']}/",
            {'title': 'Operating System Concepts, 10th ed.'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['title'], 'Operating System Concepts, 10th ed.')
        self.assertEqual(body['authors'], 'Silberschatz')
        self.assertEqual(body['studyspace'], self.studyspace.pk)

    def test_created_at_is_not_writable(self):
        reference = self._create().json()
        response = self.client.patch(
            f"{self.URL}{reference['id']}/",
            {'created_at': '1999-01-01T00:00:00Z'},
            format='json',
        )
        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json()['created_at'], reference['created_at'])

    def test_deleting_removes_it_from_the_list(self):
        reference = self._create().json()
        self.assertEqual(
            self.client.delete(f"{self.URL}{reference['id']}/").status_code, 204
        )
        self.assertEqual(self.client.get(self.URL).json(), [])

    def test_the_list_is_filtered_by_studyspace(self):
        from apps.studyspace.models import Studyspace

        other = Studyspace.objects.create(title="Algebra", description="", user=self.user)
        self._create()
        self._create(studyspace=other.pk, title="Algebra lineal")

        body = self.client.get(self.URL, {'studyspace': other.pk}).json()
        self.assertEqual([item['title'] for item in body], ["Algebra lineal"])

    def test_another_account_neither_sees_nor_touches_the_references(self):
        from apps.users.models import User

        reference = self._create().json()
        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.client.force_authenticate(intruder)

        self.assertEqual(self.client.get(self.URL).json(), [])
        self.assertEqual(
            self.client.delete(f"{self.URL}{reference['id']}/").status_code, 404
        )
        # get_queryset filtra la lectura, no la escritura: sin el guard del
        # viewset se podria citar dentro del espacio de otra cuenta.
        self.assertEqual(self._create(title="ajena").status_code, 400)

    def test_anonymous_requests_are_rejected(self):
        self.client.force_authenticate(None)
        self.assertEqual(self.client.get(self.URL).status_code, 401)


class StudyspaceUpdateApiTests(APITestCase):
    URL = '/api/studyspaces/'

    def setUp(self):
        from apps.studyspace.models import Studyspace, Tag
        from apps.users.models import User

        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="Kernel y memoria", user=self.user
        )
        self.studyspace.tags.set(
            [Tag.objects.create(name="kernel"), Tag.objects.create(name="memoria")]
        )
        self.client.force_authenticate(self.user)

    def _patch(self, payload):
        return self.client.patch(
            f"{self.URL}{self.studyspace.pk}/", payload, format='json'
        )

    def test_editing_the_title_answers_the_full_detail(self):
        response = self._patch({'title': 'Sistemas operativos I'})
        self.assertEqual(response.status_code, 200)
        body = response.json()
        self.assertEqual(body['title'], 'Sistemas operativos I')
        # La lista no trae ni la descripcion ni las notas: el que edita esta
        # parado en el detalle y necesita la pagina entera de vuelta.
        self.assertEqual(body['description'], 'Kernel y memoria')
        self.assertIn('notes', body)
        self.assertIn('references', body)

    def test_editing_the_description_leaves_the_title_alone(self):
        body = self._patch({'description': 'Planificacion de procesos'}).json()
        self.assertEqual(body['description'], 'Planificacion de procesos')
        self.assertEqual(body['title'], 'Sistemas operativos')

    def test_a_patch_that_does_not_name_the_tags_keeps_them(self):
        # Este era el bug: con [] como default, corregir un titulo borraba
        # todas las etiquetas del espacio sin que nadie lo pidiera.
        body = self._patch({'title': 'Sistemas operativos I'}).json()
        self.assertEqual(sorted(body['tags']), ['kernel', 'memoria'])

    def test_sending_the_tags_replaces_the_whole_set(self):
        body = self._patch({'tags': ['kernel', 'concurrencia']}).json()
        self.assertEqual(sorted(body['tags']), ['concurrencia', 'kernel'])

    def test_an_empty_list_clears_the_tags(self):
        # [] sigue significando "sacalas todas": es una lista que el cliente
        # mando a proposito, no un campo que no vino.
        self.assertEqual(self._patch({'tags': []}).json()['tags'], [])

    def test_another_account_cannot_edit_it(self):
        from apps.users.models import User

        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.client.force_authenticate(intruder)
        self.assertEqual(self._patch({'title': 'mio ahora'}).status_code, 404)


# Los uploads no van a media/: el FileField escribe de verdad al guardar la fila.
_MEDIA_ROOT = tempfile.mkdtemp()


@override_settings(MEDIA_ROOT=_MEDIA_ROOT)
class SourceApiTests(APITestCase):
    URL = '/api/sources/'

    @classmethod
    def tearDownClass(cls):
        shutil.rmtree(_MEDIA_ROOT, ignore_errors=True)
        super().tearDownClass()

    def setUp(self):
        from apps.studyspace.models import Source, Studyspace
        from apps.users.models import User

        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )
        self.source = Source.objects.create(
            # El titulo por defecto sale del nombre del archivo, y esta clase de
            # nombre es exactamente lo que hay que poder arreglar.
            title="Graciarena-LAINDUSTRIALIZACINCOMO-1983.pdf",
            source_type='pdf',
            file=SimpleUploadedFile("apunte.pdf", b"%PDF-1.4", content_type="application/pdf"),
            study_space=self.studyspace,
        )
        self.client.force_authenticate(self.user)

    def _detail(self):
        return f"{self.URL}{self.source.pk}/"

    def test_the_title_can_be_corrected(self):
        response = self.client.patch(
            self._detail(), {'title': 'Graciarena, La industrializacion (1983)'}, format='json'
        )
        self.assertEqual(response.status_code, 200)

        self.source.refresh_from_db()
        self.assertEqual(self.source.title, 'Graciarena, La industrializacion (1983)')

    def test_the_file_is_not_replaceable(self):
        original = self.source.file.name

        response = self.client.patch(
            self._detail(),
            {
                'title': 'Otro nombre',
                'file': SimpleUploadedFile("otro.pdf", b"%PDF-1.4", content_type="application/pdf"),
            },
            format='multipart',
        )
        self.assertEqual(response.status_code, 200)

        # Cambiarlo dejaria el HTML convertido y cada ancla de anotacion
        # describiendo un documento que dejo de existir.
        self.source.refresh_from_db()
        self.assertEqual(self.source.file.name, original)

    def test_the_reading_progress_has_its_own_route(self):
        response = self.client.patch(
            f"{self._detail()}progress/",
            {'last_anchor': 'b-4cda0adf76', 'last_position': 12.5},
            format='json',
        )
        self.assertEqual(response.status_code, 200)

        self.source.refresh_from_db()
        self.assertEqual(self.source.last_anchor, 'b-4cda0adf76')
        self.assertEqual(self.source.last_position, 12.5)

    def test_the_autosave_cannot_rename(self):
        # Es la razon de separar las rutas: el lector escribe esto solo, muchas
        # veces por minuto, y no tiene por que poder tocar el titulo.
        self.client.patch(f"{self._detail()}progress/", {'title': 'pisado'}, format='json')

        self.source.refresh_from_db()
        self.assertEqual(self.source.title, "Graciarena-LAINDUSTRIALIZACINCOMO-1983.pdf")

    def test_renaming_does_not_move_the_reading_position(self):
        self.client.patch(
            f"{self._detail()}progress/", {'last_anchor': 'b-4cda0adf76'}, format='json'
        )
        self.client.patch(self._detail(), {'title': 'Otro nombre'}, format='json')

        self.source.refresh_from_db()
        self.assertEqual(self.source.last_anchor, 'b-4cda0adf76')

    def test_deleting_a_source_takes_its_annotations(self):
        from apps.studyspace.models import Annotation

        Annotation.objects.create(
            source=self.source,
            annotation_type='highlight',
            content='La industrializacion periferica',
            anchor='b-4cda0adf76',
            page=14,
            ranges=[{'anchor': 'b-4cda0adf76', 'start': 0, 'end': 30}],
        )

        self.assertEqual(self.client.delete(self._detail()).status_code, 204)
        self.assertEqual(Annotation.objects.count(), 0)

    def test_deleting_a_source_removes_its_file_from_disk(self):
        import os

        path = self.source.file.path
        self.assertTrue(os.path.exists(path))

        self.client.delete(self._detail())
        # Django no borra el archivo al borrar la fila; lo hace la señal
        # post_delete de borrar_archivos_de_source.
        self.assertFalse(os.path.exists(path))

    def test_another_account_neither_renames_nor_deletes(self):
        from apps.users.models import User

        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.client.force_authenticate(intruder)

        self.assertEqual(
            self.client.patch(self._detail(), {'title': 'mio'}, format='json').status_code, 404
        )
        self.assertEqual(self.client.delete(self._detail()).status_code, 404)
        self.assertEqual(
            self.client.patch(
                f"{self._detail()}progress/", {'last_position': 9}, format='json'
            ).status_code,
            404,
        )


class NoteDeletionApiTests(APITestCase):
    URL = '/api/notes/'

    def setUp(self):
        from apps.studyspace.models import Block, BlockLink, Note, Studyspace
        from apps.users.models import User

        self.user = User.objects.create_user(
            email="lector@example.com", username="lector", password="x"
        )
        self.studyspace = Studyspace.objects.create(
            title="Sistemas operativos", description="", user=self.user
        )
        self.note = Note.objects.create(title="Memoria virtual", studyspace=self.studyspace)

        heading = Block.objects.create(
            id=uuid4(), note=self.note, block_type='heading', text='Paginacion', position=0
        )
        paragraph = Block.objects.create(
            id=uuid4(), note=self.note, block_type='paragraph', text='Marcos', position=1
        )
        BlockLink.objects.create(source=heading, target=paragraph)

        self.client.force_authenticate(self.user)

    def _detail(self):
        return f"{self.URL}{self.note.pk}/"

    def test_deleting_a_note_takes_its_blocks_and_their_relations(self):
        from apps.studyspace.models import Block, BlockLink

        self.assertEqual(self.client.delete(self._detail()).status_code, 204)
        # Las dos cascadean en el modelo: borrar una nota se lleva su region del
        # mapa entera, sin dejar aristas apuntando a nodos que ya no existen.
        self.assertEqual(Block.objects.count(), 0)
        self.assertEqual(BlockLink.objects.count(), 0)

    def test_deleting_a_note_leaves_the_studyspace_standing(self):
        from apps.studyspace.models import Studyspace

        self.client.delete(self._detail())
        self.assertTrue(Studyspace.objects.filter(pk=self.studyspace.pk).exists())

    def test_another_account_cannot_delete_it(self):
        from apps.studyspace.models import Note
        from apps.users.models import User

        intruder = User.objects.create_user(
            email="otro@example.com", username="otro", password="x"
        )
        self.client.force_authenticate(intruder)

        self.assertEqual(self.client.delete(self._detail()).status_code, 404)
        self.assertTrue(Note.objects.filter(pk=self.note.pk).exists())
