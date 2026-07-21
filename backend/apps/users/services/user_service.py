from django.db import transaction
from ..models import VerificationCode
from django.contrib.auth import get_user_model
from rest_framework.exceptions import ValidationError

User = get_user_model()

class UserService:
    def __init__(self, email_service=None, img_service=None):
        self.email = email_service
        self.img = img_service
        
    def deactivate_account(self, user):
        with transaction.atomic():
            # 1. Soft Delete 
            user.is_active = False
            
            user.save()
            self.email.send_goodbye(user)
    
    def request_password_reset(self, email):
        # Intentar encontrar el usuario, sino existe no lo decimos, no retornamos nada (por seguridad)
        user = User.objects.filter(email=email).first()
        message = {"message": "Si el correo existe, se han enviado instrucciones."}
        if not user:
            return message
        # Generar codigo
        code_obj = VerificationCode.create_for_user(user)
        # Enviar Email
        self.email.send_reset_code(user=user, code_obj=code_obj)
        return message

    def verify_password_reset(self, code, email):
        user = User.objects.filter(email=email).first()

        valid_code = (
            VerificationCode.objects
            .filter(user=user, code=code)
            .latest('created_at')
            if user else None
        )

        if not valid_code or not valid_code.is_valid():
            raise ValidationError("Código inválido o expirado.")

        return {"message": "Código verificado correctamente"}

    def confirm_password_reset(self, email, new_password, code):
        user = User.objects.filter(email=email).first()

        active_code = (
            VerificationCode.objects
            .filter(user=user, code=code)
            .latest('created_at')
            if user else None
        )
        if not active_code or not active_code.is_valid():
            raise ValidationError("Código inválido o expirado.")

        user.set_password(new_password)
        user.save()
        active_code.delete()

        return {'message': 'Contraseña reestablecida correctamente'}

    def update_profile(self, user, data, new_profile_img, profile_img_to_delete_id):
        for attr, value in data.items():
            setattr(user, attr, value)

        if new_profile_img:
            user.avatar_url = self.img.upload(user, new_profile_img).url
        if profile_img_to_delete_id:
            self.img.destroy(user, profile_img_to_delete_id)

        user.save()
        return user
