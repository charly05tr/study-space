from apps.users.models import User

class UserRepository:
    def get_by_id(self, user_id: int) -> User:
        try:
            return User.objects.get(id=user_id)
        except User.DoesNotExist:
            return None

    def save(self, user_instance: User):
        user_instance.save()