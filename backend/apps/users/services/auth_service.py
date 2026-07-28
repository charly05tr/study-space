from django.db import transaction
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError
from ..interfaces import ITokenService
from ..models import VerificationCode

User = get_user_model()

class AuthService:
    def __init__(self, token_service: ITokenService, email_service=None, social_provider=None):
        self.social = social_provider
        self.tokens = token_service
        self.email = email_service

    def login_with_google(self, id_token: str, role: str) -> dict:
        """Valida el id_token y retorna {'user': user, 'tokens': tokens}"""
        #1. Verificar id_token (Externo)
        google_data = self.social.validate_token(id_token)
        #2. Obtener o crear user (DB)
        user, created = User.objects.get_or_create(
            email=google_data['email'],
            defaults={
                'username':google_data['email'],
                'google_id':google_data['google_id'],
                'avatar_url': google_data['avatar'],
                'is_verified': True
            }
        )
        #3. SideEffect: correo de bienvenida
        if created:
            self.email.send_welcome(user)
        #4. Generar nuestros propios tokens
        tokens = self.tokens.get_tokens_for_user(user)
        
        return {
            'user': user,
            'tokens': tokens
        }

    def login_with_credentials(self, user) -> dict:
        """Recibe email/password y retorna  {'user': user, 'tokens': tokens}"""
        #1. Generar tokens
        tokens = self.tokens.get_tokens_for_user(user) #{access, refresh}
        #2. Actualizar last login
        from django.contrib.auth.models import update_last_login
        update_last_login(None, user)
        return {
            'user': user,
            'tokens': tokens
        }

    @transaction.atomic
    def register_with_email(self, user_data: dict, email, password):
        # 1. Buscamos usuario
        user = User.objects.filter(email=email).first()
        
        is_reactivation = False

        if user:
            # --- CASO: EL USUARIO YA EXISTE (REACTIVACIÓN) ---
            if not user.is_active:
                # Actualizamos datos
                ALLOWED_FIELDS = ['first_name', 'last_name']
                for field in ALLOWED_FIELDS:
                    if field in user_data:
                        setattr(user, field, user_data[field])
                
                # Actualizamos la contraseña
                user.set_password(password)
                user.save()
                
                is_reactivation = True
            else:
                raise ValidationError("El usuario ya existe y está activo.")
        else:
            # --- CASO: NUEVO USUARIO ---
            user = User.objects.create_user(password=password, is_active=False, email=email, **user_data)

        # 2. Generar codigo
        code_obj = VerificationCode.create_for_user(user)                                                                                                                                                               
        # 3. Enviar Correo
        
        self.email.send_verification_code(user, code_obj)

        # 4. Aun no se manda el token
        return {
            'user': user,
            'tokens': None, 
            'message': 'Se ha enviado un correo para activar la cuenta.'
        }
        
    def resend_verification_code(self, email):
        user = User.objects.filter(email=email).first()

        # Respuesta neutra: no revelamos si el correo existe ni si ya esta
        # activo. Antes, un email desconocido llegaba a create_for_user(None)
        # y reventaba con 500.
        neutral = {
            'user': None,
            'tokens': None,
            'message': 'Si el correo existe y esta pendiente, se ha enviado un nuevo codigo.'
        }

        if not user or user.is_active:
            return neutral

        code_obj = VerificationCode.create_for_user(user)

        self.email.send_verification_code(user, code_obj)

        return {
            'user': user,
            'tokens': None,
            'message': 'Se ha reenviado un correo para activar la cuenta.'
        }

    def change_password(self, user, new_password):
        """
        Cambia la contraseña de un usuario autenticado.
        """
        user.set_password(new_password)
        user.save()
        # forzar un re-login en todos los dispositivos.
        self.tokens.revoke_all_tokens(user)
        
        return {"message": "Contraseña actualizada exitosamente."}

    def activate_account(self, code, email):
        user = User.objects.filter(email=email).first()

        valid_code = (
            VerificationCode.objects
            .filter(user=user, code=code)
            .latest('created_at')
            if user else None
        )
        if not valid_code or not valid_code.is_valid():
            raise ValidationError("Código no válido o expirado.")

        user.is_active = True 
        user.is_verified = True
        user.save()
        tokens = self.tokens.get_tokens_for_user(user)
        valid_code.delete()
        self.email.send_welcome(user)
        return {
            'user': user,
            'tokens': tokens
        }