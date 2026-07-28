from django.core.files.base import ContentFile

from apps.studyspace.models import Source
from apps.studyspace.services.pdf_service import CONVERTER_VERSION, pdf_to_html


class SourceService:
    """Entrega el HTML de lectura de una fuente, convirtiéndola cuando hace falta."""

    def get_reader_html(self, source: Source) -> str:
        if self._is_current(source):
            with source.converted_file.open('rb') as stored_html:
                return stored_html.read().decode('utf-8')

        return self.convert(source)

    def convert(self, source: Source) -> str:
        """Convierte la fuente y guarda el resultado, reemplazando el anterior."""
        with source.file.open('rb') as original:
            reader_html = pdf_to_html(original.read(), title=source.title)

        # FileField renombra en lugar de sobrescribir, así que sin este borrado
        # cada reconversión dejaría el HTML viejo huérfano en media/.
        if source.converted_file:
            source.converted_file.delete(save=False)

        source.converted_file.save(
            f'{source.pk}.html',
            ContentFile(reader_html.encode('utf-8')),
            save=False,
        )
        source.converted_with = CONVERTER_VERSION
        source.save(update_fields=['converted_file', 'converted_with', 'updated_at'])

        return reader_html

    def _is_current(self, source: Source) -> bool:
        return bool(source.converted_file) and source.converted_with == CONVERTER_VERSION
