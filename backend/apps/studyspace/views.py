"""Plain Django views used for manual testing, outside the DRF API."""

from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, render

from apps.studyspace.models import Source
from apps.studyspace.services.pdf_service import pdf_to_html
from apps.studyspace.services.source_service import SourceService

MAX_UPLOAD_BYTES = 50 * 1024 * 1024


def pdf_to_html_view(request):
    """Upload a PDF and render the converted HTML in the browser."""
    if request.method != "POST":
        return render(request, "studyspace/pdf_to_html.html")

    uploaded = request.FILES.get("pdf")
    if uploaded is None:
        return HttpResponseBadRequest("No PDF file was uploaded.")

    if uploaded.size > MAX_UPLOAD_BYTES:
        return HttpResponseBadRequest("The PDF exceeds the 50 MB limit.")

    try:
        converted = pdf_to_html(uploaded.read(), title=uploaded.name)
    except Exception as error:
        return HttpResponseBadRequest(f"The PDF could not be converted: {error}")

    return HttpResponse(converted)


def source_html_view(request, source_id):
    """Serve a stored source, converting it the first time it is requested."""
    source = get_object_or_404(Source, pk=source_id)

    try:
        return HttpResponse(SourceService().get_reader_html(source))
    except Exception as error:
        return HttpResponseBadRequest(f"The source could not be converted: {error}")
