from abc import ABC, abstractmethod
from django.core.files.uploadedfile import UploadedFile

class IImageService(ABC):
    @abstractmethod
    def upload(self, image: UploadedFile) -> str:
        """sube la imagen y retorna la url"""
        pass

    def destroy(self, image_url: str):
        """Elimina la imagen de la cloud"""
        pass

class IEmailService(ABC):
    @abstractmethod
    def send_welcome(self, user):
        """Envia un correo de bienvenida"""
        pass

    def send_verification_code(self, user, code_obj):
        """Envia un correo para verificar la cuenta"""
        pass

    def send_reset_code(self, user, code_obj):
        """Envia un correo para cambiar contrasena"""
        pass

    def send_goodbye(self, user):
        """Enviar correo de despedida"""
        pass
    
    def send_reactivation_code(self, user, code_obj):
        """Enviar correo de reactivacion"""
        pass

    def send(self, user, message, subject):
        """Enviar correo generico"""
        pass