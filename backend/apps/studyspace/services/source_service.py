from django.core.files.base import ContentFile

from apps.studyspace.models import Source, Studyspace
from apps.studyspace.services import converters
from apps.users.models import User


class SourceService:
    """Entrega el HTML de lectura de una fuente, convirtiéndola cuando hace falta."""

    def get_user_sources(self, user: User) -> list[Source]:
        return Source.objects.filter(study_space__user=user)

    def get_reader_html(self, source: Source) -> str:
        if self._is_current(source):
            with source.converted_file.open('rb') as stored_html:
                return stored_html.read().decode('utf-8')

        return self.convert(source)

    def convert(self, source: Source, mode: str | None = None) -> str:
        """Convierte la fuente y guarda el resultado, reemplazando el anterior.

        `mode` cambia el conversor de la fuente de forma permanente: el HTML
        guardado y el modo tienen que describir el mismo archivo, o is_converted
        compararia la version contra el conversor equivocado.
        """
        if mode is not None and mode != source.converter_mode:
            source.converter_mode = mode

        render = self._renderer_for(source.converter_mode)

        with source.file.open('rb') as original:
            reader_html = render(original.read(), title=source.title)

        # FileField renombra en lugar de sobrescribir, así que sin este borrado
        # cada reconversión dejaría el HTML viejo huérfano en media/.
        if source.converted_file:
            source.converted_file.delete(save=False)

        source.converted_file.save(
            f'{source.pk}.html',
            ContentFile(reader_html.encode('utf-8')),
            save=False,
        )
        source.converted_with = converters.version_of(source.converter_mode)
        source.save(update_fields=[
            'converted_file', 'converted_with', 'converter_mode', 'updated_at',
        ])

        return reader_html

    def _renderer_for(self, mode: str):
        """Import local: cada conversor arrastra PyMuPDF, y solo hace falta el
        que se va a usar."""
        if mode == converters.LAYOUT:
            from apps.studyspace.services.pdf_layout_service import pdf_to_layout_html
            return pdf_to_layout_html

        from apps.studyspace.services.pdf_service import pdf_to_html
        return pdf_to_html

    def _is_current(self, source: Source) -> bool:
        # Una sola definicion de "esta convertido", compartida con el serializer.
        return source.is_converted
