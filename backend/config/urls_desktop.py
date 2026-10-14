"""URL configuration for desktop mode: the API plus the built frontend.

Reuses the regular patterns and adds media files and an SPA fallback that never
shadows /api, /admin, /media, /static, /ws, /dev or /silk.
"""

from django.conf import settings
from django.http import FileResponse, HttpResponse
from django.urls import re_path
from django.views.static import serve

from config.urls import urlpatterns as base_patterns


def spa_index(request, path=''):
    index = settings.FRONTEND_DIST / 'index.html'
    if not index.is_file():
        return HttpResponse(
            'Frontend not built. Run "pnpm build:desktop" in frontend/ (or setup-desktop.bat).',
            status=503,
            content_type='text/plain',
        )
    return FileResponse(open(index, 'rb'), content_type='text/html')


urlpatterns = [p for p in base_patterns if getattr(p, 'name', None) != 'home'] + [
    re_path(r'^media/(?P<path>.*)$', serve, {'document_root': settings.MEDIA_ROOT}),
    re_path(r'^(?!(?:api|admin|media|static|ws|dev|silk)(?:/|$))(?P<path>.*)$', spa_index),
]
