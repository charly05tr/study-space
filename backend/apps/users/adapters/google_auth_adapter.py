from ..interfaces import ISocialProvider

class GoogleAuthAdapter(ISocialProvider):
    def validate_token(self, token):
        #TODO: implementar la validacion de token de login con google, retornar {email, google_id, avatar_link, name}
        pass