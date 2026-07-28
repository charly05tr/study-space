from rest_framework_simplejwt.tokens import RefreshToken
from ..interfaces import ITokenService

class JWTAuthAdapter(ITokenService):
    def get_tokens_for_user(self, user):
        refresh = RefreshToken.for_user(user)

        return {
            'refresh': str(refresh),
            'access': str(refresh.access_token)
        }

    def revoke_all_tokens(self, user):
        #TODO: Implementar eliminacion de tokens
        pass