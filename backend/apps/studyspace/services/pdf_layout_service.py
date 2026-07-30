"""Faithful PDF conversion: every page reproduced where the PDF drew it.

The other converter (`pdf_service`) rebuilds the document as prose — Markdown
first, then semantic HTML — which is what makes it reflow and scale with the
font size, and also what makes it reinterpret structure it cannot always read.

This one does not interpret anything. PyMuPDF reports each line of text with its
position, size and typeface, and that is emitted verbatim inside an absolutely
positioned page box. The result looks like the PDF because it *is* the PDF's own
layout.

The one thing deliberately not kept is colour. PyMuPDF writes the ink colour of
every span inline, where no stylesheet can reach it, so a reader that lets you
choose the page and text colour would be overruled on every line. Those
declarations are dropped during conversion and the two CSS variables below own
the palette instead. Raster images keep their own colours: they are pixels, not
text, and there is nothing to recolour.

Not carried over from the PDF:
  - vector graphics (table rules, underlines, drawn boxes). PyMuPDF's HTML
    output covers text and raster images only.
  - reflow. The page box is a fixed size in points, so the reader scales it to
    the viewport instead of rewrapping it.
"""

import html
import os
import tempfile
from html.parser import HTMLParser

import fitz  # PyMuPDF

from apps.studyspace.services import converters
from apps.studyspace.services.reader_anchors import BlockAnchors

CONVERTER_VERSION = converters.version_of(converters.LAYOUT)

# CSS resolves lengths in `pt` against 96 dpi regardless of the PDF's own
# resolution, so this is the exact factor the browser will use.
PT_TO_PX = 96 / 72

# Declarations dropped from every inline style, because the reader owns them.
OVERRIDDEN_PROPERTIES = frozenset({"color", "background-color", "background"})

# Tags PyMuPDF emits. Anything outside this set means the extractor changed
# shape and is passed through untouched rather than silently swallowed.
VOID_TAGS = frozenset({"img", "br"})

DOCUMENT_HEAD = """<!DOCTYPE html>
<html lang="es" data-converter="layout" data-page-width="{page_width}">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{title}</title>
    <style>
        /* The PDF supplies position, size and typeface; only the palette and
           the zoom are decided here, and both are variables the reader sets. */
        :root {
            --page-background: #fdfbf7;
            --text-color: #3d3b49;
            --muted-color: #6f685c;
            --rule-color: #e6e0d4;
            --target-tint: #f3e8cd;
            --selection-tint: #ecd694;
            /* The page box is a fixed size in points. Fitting it to the
               viewport is the reader's job; 1 is the un-scaled fallback. */
            --page-zoom: 1;
        }

        html, body {
            margin: 0;
            padding: 0;
            background-color: var(--page-background);
            color: var(--text-color);
        }

        /* `zoom` and not `transform: scale()`: zoom takes part in layout, so
           scroll offsets and element rectangles stay in one coordinate system.
           A transform would leave the reader measuring un-scaled boxes while
           the user looks at scaled ones. */
        .pagina {
            position: relative;
            zoom: var(--page-zoom);
            margin: 0 auto;
            background-color: var(--page-background);
            border-bottom: 1px solid var(--rule-color);
            /* The PDF clips at the page edge; images placed to bleed past it
               are drawn that way on purpose. */
            overflow: hidden;

            /* A page is one drawn line per <p>, so a book is tens of thousands
               of absolutely positioned elements. Laying out and restyling all
               of them at once is what makes a long document unusable — a change
               of ink colour should not cost a full relayout of chapter 40.
               This skips everything off screen.

               Sound here in a way it would not be for the reflowed converter:
               size containment makes an element size as if it had no contents,
               and these pages carry their width and height as declared inline
               styles. The box is exact whether or not its contents are drawn,
               so nothing about the scrollbar or the page positions shifts as
               the reader moves through the document, and no
               contain-intrinsic-size guess is involved.

               The cost is that a skipped page's CONTENTS have no geometry:
               a block inside one measures as an empty rect until the page is
               near the viewport. Everything that jumps to a block goes through
               the page first — see scrollToAnchor in annotationDom.ts and
               restoreAnchor in ReaderFrame.tsx. */
            content-visibility: auto;
        }

        /* No padding on .pagina, ever: an absolutely positioned child is placed
           against the padding box, so any padding would move every line of the
           page off the coordinates the PDF gave them. */
        .pagina p {
            position: absolute;
            /* Each <p> is one drawn line. Collapsing its spaces would close the
               gaps the PDF used to align columns inside a line. */
            white-space: pre;
            margin: 0;
            color: var(--text-color);
        }

        .pagina img {
            position: absolute;
            /* Raster content keeps its own colours; only the text follows the
               reader's palette. */
        }

        /* The reader paints its highlights as <mark>. Left at the browser's
           yellow default it would collide with the tints below. */
        mark { background: none; color: inherit; }

        [id] { scroll-margin-top: 1rem; }

        :target { background-color: var(--target-tint); }

        @media (prefers-reduced-motion: no-preference) {
            html { scroll-behavior: smooth; }
        }

        @media print {
            .pagina { zoom: 1; border-bottom: none; }
        }
    </style>
</head>
<body>
"""

DOCUMENT_TAIL = """
</body>
</html>
"""


def _clean_style(value: str) -> str:
    """Drops the declarations the reader's palette is meant to own."""
    kept = []
    for declaration in value.split(";"):
        if not declaration.strip():
            continue
        name, separator, _ = declaration.partition(":")
        if separator and name.strip().lower() in OVERRIDDEN_PROPERTIES:
            continue
        kept.append(declaration.strip())
    return ";".join(kept)


def _render_attributes(attributes) -> str:
    parts = []
    for name, value in attributes:
        if value is None:
            parts.append(f" {name}")
        else:
            parts.append(f' {name}="{html.escape(value, quote=True)}"')
    return "".join(parts)


class _PageRewriter(HTMLParser):
    """Turns one page of PyMuPDF's HTML into markup the reader understands.

    Three things change on the way through: the page wrapper becomes a
    `.pagina` the reader can page through, every line gets the content-derived
    id and `data-pagina` that annotations resolve against, and the inline colour
    declarations are removed.

    A line's id is derived from its text, which is only complete once the
    closing tag arrives — so the whole `<p>` is buffered and emitted at `</p>`.
    """

    def __init__(self, anchors: BlockAnchors, page_number: int):
        # Entities are decoded here and re-escaped on the way out, so the text
        # used for the anchor digest is the text a reader actually sees.
        super().__init__(convert_charrefs=True)
        self.anchors = anchors
        self.page_number = page_number
        self.parts: list[str] = []
        self.page_width_pt = 0.0

        # Set while inside a <p>: output goes to the buffer instead, and the
        # plain text is accumulated alongside it for the anchor.
        self._buffer: list[str] | None = None
        self._line_style = ""
        self._line_text: list[str] = []

    def _emit(self, markup: str):
        (self._buffer if self._buffer is not None else self.parts).append(markup)

    def handle_starttag(self, tag, attrs):
        attributes = dict(attrs)

        if tag == "div":
            style = attributes.get("style", "")
            self.page_width_pt = _width_of(style)
            self.parts.append(
                f'<div class="pagina" id="pagina-{self.page_number}"'
                f' style="{html.escape(style, quote=True)}">'
            )
            return

        if tag == "p":
            # Nested <p> cannot happen in this output, and treating one as a
            # new line would strand the buffer of the enclosing one.
            self._buffer = []
            self._line_style = _clean_style(attributes.get("style", ""))
            self._line_text = []
            return

        # Stripping the colour can empty a style outright; an empty style
        # attribute is noise on every span of a book-length document.
        kept = []
        for name, value in attrs:
            if name == "style" and value is not None:
                value = _clean_style(value)
                if not value:
                    continue
            kept.append((name, value))

        closing = "/>" if tag in VOID_TAGS else ">"
        self._emit(f"<{tag}{_render_attributes(kept)}{closing}")

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)

    def close(self):
        # A page whose last <p> was never closed still has to reach the output.
        super().close()
        self._flush_line()

    def handle_endtag(self, tag):
        if tag == "div":
            self.parts.append("</div>\n")
            return

        if tag == "p":
            self._flush_line()
            return

        if tag in VOID_TAGS:
            # Already closed when the start tag was emitted.
            return

        self._emit(f"</{tag}>")

    def handle_data(self, data):
        if self._buffer is not None:
            self._line_text.append(data)
        self._emit(html.escape(data, quote=False))

    def _flush_line(self):
        if self._buffer is None:
            return

        anchor = self.anchors.assign("".join(self._line_text))
        identity = (
            f' id="{anchor}" data-pagina="{self.page_number}"' if anchor else ""
        )
        style = f' style="{html.escape(self._line_style, quote=True)}"' if self._line_style else ""

        self.parts.append(f"<p{identity}{style}>{''.join(self._buffer)}</p>\n")
        self._buffer = None
        self._line_text = []


def _width_of(style: str) -> float:
    """Page width in points, read off the wrapper PyMuPDF emits."""
    for declaration in style.split(";"):
        name, separator, value = declaration.partition(":")
        if separator and name.strip().lower() == "width":
            try:
                return float(value.strip().removesuffix("pt"))
            except ValueError:
                return 0.0
    return 0.0


def pdf_to_layout_html(pdf_bytes, title="Libro Convertido"):
    """Convert PDF bytes into a standalone HTML document that keeps the layout.

    The bytes are staged on disk for the same reason the reflow converter does
    it: PyMuPDF is opened from a path so nothing carries over between two
    conversions running in the same long-lived worker process.
    """
    descriptor, pdf_path = tempfile.mkstemp(suffix=".pdf")
    try:
        with os.fdopen(descriptor, "wb") as staged_pdf:
            staged_pdf.write(pdf_bytes)

        anchors = BlockAnchors()
        pages = []
        widest_pt = 0.0

        with fitz.open(pdf_path) as document:
            for page_number, page in enumerate(document, start=1):
                rewriter = _PageRewriter(anchors, page_number)
                rewriter.feed(page.get_text("html"))
                rewriter.close()

                widest_pt = max(widest_pt, rewriter.page_width_pt)
                pages.append("".join(rewriter.parts))
    finally:
        # Never let cleanup mask a conversion error.
        try:
            os.unlink(pdf_path)
        except OSError:
            pass

    # Handed to the reader as a plain number of CSS pixels so it can work out
    # the fit-to-width zoom without measuring anything.
    head = (
        DOCUMENT_HEAD
        .replace("{title}", html.escape(title), 1)
        .replace("{page_width}", f"{widest_pt * PT_TO_PX:.0f}", 1)
    )

    return "".join([head, *pages, DOCUMENT_TAIL])
