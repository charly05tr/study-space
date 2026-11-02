from apps.studyspace.models import NoteReview
from apps.users.models import User


class NoteReviewService:

    def get_user_reviews(self, user: User):
        # A review belongs to whoever owns the studyspace of its note.
        return (
            NoteReview.objects
            .filter(note__studyspace__user=user)
        )

    def create_review(self, data: dict) -> NoteReview:
        return NoteReview.objects.create(**data)
