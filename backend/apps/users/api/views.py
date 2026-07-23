from rest_framework import status, viewsets
from rest_framework.decorators import action
from rest_framework.response import Response 
from rest_framework.permissions import IsAuthenticated, AllowAny, IsAdminUser
from apps.users.adapters.google_auth_adapter import GoogleAuthAdapter
from apps.users.adapters.jwt_auth_adapter import JWTAuthAdapter
from apps.users.api.serializers import (
    UserUpdateSerializer, 
    UserOutputSerializer, 
    PasswordResetRequestSerializer,
    PasswordResetConfirmSerializer,
    EmailLoginSerializer,
    EmailRegisterSerializer,
    AuthResponseSerializer,
    ChangePasswordSerializer,
    ActivationSerializer,
)
from apps.users.services.user_service import UserService
from apps.users.services.auth_service import AuthService
from apps.users.models import User 

class UserViewSet(viewsets.ModelViewSet):
    serializer_class = UserOutputSerializer
    permission_classes = [AllowAny]

    def get_queryset(self):
        return User.objects.filter(is_active=True)

    def get_object(self):
        return self.request.user

    def get_serializer_class(self):
        if self.action in ['update', 'partial_update']:
            return UserUpdateSerializer
        if self.action in ['create', 'register_with_email']:
            return EmailRegisterSerializer
        if self.action in ['password_reset_request', 'resend_verification_code']:
            return PasswordResetRequestSerializer
        if self.action == 'password_reset_confirm':
            return PasswordResetConfirmSerializer
        if self.action in ['password_reset_verify', 'activate']:
            return ActivationSerializer
        if self.action == 'login_with_email':
            return EmailLoginSerializer
        if self.action == 'change_password':
            return ChangePasswordSerializer
        return UserOutputSerializer 

    def get_permissions(self):
        if self.action in ['list', 'create']:
            permission_classes = [IsAdminUser]

        elif self.action in ['update', 'partial_update', 'change_password', 'retrieve', 'destroy']:
            permission_classes = [IsAuthenticated]
        else:
            permission_classes = [AllowAny]
        return [permission() for permission in permission_classes]

    def update(self, request, *args, **kwargs):
        instance = self.get_object()
        serializer = self.get_serializer(instance, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data.copy()
        new_profile_img = data.pop('new_profile_img', None)
        profile_img_to_delete_id = data.pop('profile_img_to_delete_id', None)

        service = UserService(img_service=get_image_service())
        user = service.update_profile(
            instance,
            data=data,
            new_profile_img=new_profile_img,
            profile_img_to_delete_id=profile_img_to_delete_id
        )
        response_serializer = UserOutputSerializer(user)
        return Response(response_serializer.data, status=status.HTTP_200_OK)

    def perform_destroy(self, instance):
        service = UserService()
        service.deactivate_account(user=instance)
    
    @action(detail=False, methods=['post'],  permission_classes=[AllowAny])
    def password_reset_request(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = UserService() 
        result = service.request_password_reset(serializer.validated_data['email'])
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'],  permission_classes=[AllowAny])
    def password_reset_verify(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = UserService(email_service=get_email_service())
        result = service.verify_password_reset(
            code=serializer.validated_data['code'],
            email=serializer.validated_data['email']
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'],  permission_classes=[AllowAny])
    def password_reset_confirm(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        service = UserService(email_service=get_email_service()) 
        result = service.confirm_password_reset(
            email=serializer.validated_data['email'],
            new_password=serializer.validated_data['new_password'],
            code=serializer.validated_data['code']
        )
        return Response(result, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'],  permission_classes=[AllowAny])
    def activate(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        # 2. Instanciar servicio
        auth_service = AuthService(
            social_provider=GoogleAuthAdapter(),
            token_service=JWTAuthAdapter(),
            email_service=get_email_service()
        )
        # 3. Ejecutar activación
        result = auth_service.activate_account(
            code=serializer.validated_data['code'],
            email=serializer.validated_data['email']
        )
        # 4. Responder 
        return Response({
            "message": "Cuenta activada exitosamente.",
            "user": UserOutputSerializer(result['user']).data,
            "tokens": result['tokens']
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'],  permission_classes=[AllowAny])
    def register_with_email(self, request):
        #1. validar datos con serializer
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        user_data = serializer.validated_data.copy()

        email = user_data.pop('email', None)
        password = user_data.pop('password', None)
        #2. Instanciar servicio e inyectar dependencias
        auth_service = AuthService(
            token_service=JWTAuthAdapter(), 
            email_service=get_email_service()
        )
        #3. Ejecutar logica
        result = auth_service.register_with_email(
            user_data=user_data,
            email=email,
            password=password,
        )
        #4. Responder
        return Response({
            "message": result['message'],
            "user": UserOutputSerializer(result['user']).data
            # No enviamos tokens JWT. El frontend debe redirigir a 
            # una pantalla de "Revisa tu correo".
        }, status=status.HTTP_201_CREATED)
        
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def resend_verification_code(self, request):
        serializer = self.get_serializer(data=request.data)
        serializer.is_valid(raise_exception=True)

        auth_service = AuthService(
            token_service=JWTAuthAdapter(), 
            email_service=get_email_service()
        )        
        
        result = auth_service.resend_verification_code(serializer.validated_data['email'])
        
        return Response({
            "message": result['message'],
            "user": UserOutputSerializer(result['user']).data
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'],  permission_classes=[AllowAny])
    def login_with_email(self, request):
        #1. Validar datos con serializer
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        user = serializer.context['user']
        #2. Instanciar servicio e inyectar dependencias
        auth_service = AuthService(
            token_service=JWTAuthAdapter(), 
            email_service=get_email_service()
        )
        #3. Ejecutar logica
        auth_data = auth_service.login_with_credentials(user)
        #4. Responder
        output_serializer = AuthResponseSerializer(auth_data)
        return Response(output_serializer.data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'])
    def change_password(self, request):
        serializer = self.get_serializer(data=request.data, context={'request': request})
        serializer.is_valid(raise_exception=True)
        service = AuthService(
            token_service=JWTAuthAdapter(), 
            email_service=get_email_service()
        ) 
        result = service.change_password(
            user=request.user,
            new_password=serializer.validated_data['new_password']
        )
        return Response(result, status=status.HTTP_200_OK)
    