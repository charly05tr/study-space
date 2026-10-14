from django.conf import settings
from django.contrib import admin
from django.views.generic import TemplateView
from django.urls import path, include
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import (
    TokenVerifyView,
    TokenRefreshView,
)
from rest_framework_nested.routers import NestedDefaultRouter
from drf_spectacular.views import SpectacularAPIView, SpectacularRedocView, SpectacularSwaggerView
from apps.users.api.views import UserViewSet
from apps.studyspace.api.views import (
    StudyspaceViewSet,
    NoteViewSet,
    SourceViewSet,
    ReferenceViewSet,
    AnnotationViewSet,
    BlockViewSet,
    BlockLinkViewSet,
    StudySessionViewSet,
    PlannedSessionViewSet,
)
from apps.studyspace.views import pdf_to_html_view, source_html_view

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='users')
router.register(r'studyspaces', StudyspaceViewSet, basename='studyspaces')
router.register(r'notes', NoteViewSet, basename='notes')
router.register(r'sources', SourceViewSet, basename='sources')
router.register(r'references', ReferenceViewSet, basename='references')
router.register(r'annotations', AnnotationViewSet, basename='annotations')
router.register(r'blocks', BlockViewSet, basename='blocks')
router.register(r'block-links', BlockLinkViewSet, basename='block-links')
router.register(r'study-sessions', StudySessionViewSet, basename='study-sessions')
router.register(r'planned-sessions', PlannedSessionViewSet, basename='planned-sessions')

urlpatterns = [
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('admin/', admin.site.urls),
    #dev tools
    path('dev/pdf-to-html/', pdf_to_html_view, name='pdf_to_html'),
    path('dev/sources/<int:source_id>/html/', source_html_view, name='source_html'),
    #api
    path('api/', include(router.urls)),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    #API documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]                                                                                               

if 'silk' in settings.INSTALLED_APPS:
    urlpatterns += [path('silk/', include('silk.urls', namespace='silk'))]