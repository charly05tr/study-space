"""Plain Django views used for manual testing, outside the DRF API."""

from django.contrib.auth.decorators import login_required
from django.http import HttpResponse, HttpResponseBadRequest
from django.shortcuts import get_object_or_404, redirect, render

from apps.studyspace.models import Source, Studyspace
from apps.studyspace.services.source_service import SourceService

MAX_UPLOAD_BYTES = 50 * 1024 * 1024

# These views have no login page of their own; the admin session is enough for
# manual testing and keeps request.user real instead of guessed.
ADMIN_LOGIN = "/admin/login/"


@login_required(login_url=ADMIN_LOGIN)
def pdf_to_html_view(request):
    """Upload a PDF into a studyspace, convert it, and store the result."""
    if request.method != "POST":
        return render(
            request,
            "studyspace/pdf_to_html.html",
            {
                "studyspaces": Studyspace.objects.filter(user=request.user),
                "sources": Source.objects.filter(
                    study_space__user=request.user
                ).select_related("study_space"),
            },
        )

    uploaded = request.FILES.get("pdf")
    if uploaded is None:
        return HttpResponseBadRequest("No PDF file was uploaded.")

    if uploaded.size > MAX_UPLOAD_BYTES:
        return HttpResponseBadRequest("The PDF exceeds the 50 MB limit.")

    studyspace_title = (request.POST.get("studyspace") or "").strip()
    if not studyspace_title:
        return HttpResponseBadRequest("A studyspace name is required.")

    studyspace, _ = Studyspace.objects.get_or_create(
        title=studyspace_title,
        user=request.user,
        defaults={"description": ""},
    )

    source = Source.objects.create(
        title=uploaded.name[:255],
        source_type=Source.SourceType.PDF,
        file=uploaded,
        study_space=studyspace,
    )

    try:
        SourceService().convert(source)
    except Exception as error:
        # Deleting the row also removes the uploaded file, so a PDF that cannot
        # be converted does not leave a stored source nobody can open.
        source.delete()
        return HttpResponseBadRequest(f"The PDF could not be converted: {error}")

    return redirect("source_html", source_id=source.pk)


@login_required(login_url=ADMIN_LOGIN)
def source_html_view(request, source_id):
    """Serve a stored source, converting it the first time it is requested."""
    source = get_object_or_404(
        Source, pk=source_id, study_space__user=request.user
    )

    try:
        return HttpResponse(SourceService().get_reader_html(source))
    except Exception as error:
        return HttpResponseBadRequest(f"The source could not be converted: {error}")
