from django.contrib.auth import get_user_model
from rest_framework.authentication import BaseAuthentication

LOCAL_USER_EMAIL = 'local@studyspace.local'
LOCAL_USERNAME = 'local'


def get_local_user():
    """The one account of desktop mode, created on first use."""
    User = get_user_model()
    user = User.objects.filter(email=LOCAL_USER_EMAIL).first()
    if user is None:
        user = User.objects.create_user(
            email=LOCAL_USER_EMAIL,
            password=None,
            username=LOCAL_USERNAME,
            is_verified=True,
            is_staff=True,
            is_superuser=True,
        )
    return user


class LocalUserAuthentication(BaseAuthentication):
    """Authenticates every request as the single local user. Desktop settings only."""

    def authenticate(self, request):
        return (get_local_user(), None)
