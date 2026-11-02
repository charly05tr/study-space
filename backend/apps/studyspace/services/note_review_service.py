from apps.studyspace.models import NoteReview
from apps.users.models import User


class NoteReviewService:

    def get_user_reviews(self, user: User):
        # A review belongs to whoever owns the studyspace of its note.
        return (
            NoteReview.objects
            .filter(note__studyspace__user=user)
            # `note_title` is serialized on every row.
            .select_related('note')
        )

    def create_review(self, data: dict) -> NoteReview:
        return NoteReview.objects.create(**data)
