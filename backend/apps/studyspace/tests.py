import re

import fitz
from django.test import SimpleTestCase

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
