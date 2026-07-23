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
from apps.studyspace.api.views import StudyspaceViewSet

router = DefaultRouter()
router.register(r'users', UserViewSet, basename='users')
router.register(r'studyspace', StudyspaceViewSet, basename='studyspace')

urlpatterns = [
    path('', TemplateView.as_view(template_name='index.html'), name='home'),
    path('admin/', admin.site.urls),
    #api
    path('api/', include(router.urls)),
    path('api/auth/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/auth/verify/', TokenVerifyView.as_view(), name='token_verify'),
    #API documentation
    path('api/schema/', SpectacularAPIView.as_view(), name='schema'),
    path('api/schema/swagger-ui/', SpectacularSwaggerView.as_view(url_name='schema'), name='swagger-ui'),
    path('api/schema/redoc/', SpectacularRedocView.as_view(url_name='schema'), name='redoc'),
]                                                                                               

urlpatterns += [path('silk/', include('silk.urls', namespace='silk'))]