from abc import ABC, abstractmethod

class ISocialProvider(ABC):
    @abstractmethod
    def validate_token(self, token: str) -> dict:
        """Retorna {email, google_id/facebook_id/ect, avatar, name}"""
        pass


class ITokenService(ABC):
    @abstractmethod
    def get_tokens_for_user(self, user) -> dict:
        """Retorna {access, refresh}"""
        pass

    def revoke_all_tokens(self, user):
        """Elimina todos los tokens"""
        pass