from django.db import transaction
from django.db.models import Count, Max
from rest_framework.exceptions import ValidationError

from apps.studyspace.models import Question, Quiz, Studyspace
from apps.users.models import User


class QuizService:

    def get_user_quizzes(self, user: User):
        return (
            Quiz.objects
            .filter(studyspace__user=user)
            .annotate(question_count=Count('questions'))
        )

    def get_user_questions(self, user: User):
        return Question.objects.filter(quiz__studyspace__user=user)

    @transaction.atomic
    def create_quiz(self, studyspace: Studyspace, data: dict, questions: list[dict]) -> Quiz:
        """A draft quiz with all its questions, or nothing."""
        quiz = Quiz.objects.create(studyspace=studyspace, status=Quiz.Status.DRAFT, **data)
        for position, question in enumerate(questions):
            self._create_question(quiz, {**question, 'position': position})
        return quiz

    @transaction.atomic
    def add_question(self, quiz: Quiz, data: dict) -> Question:
        """Append to the end unless a position is given."""
        if data.get('position') is None:
            last = quiz.questions.aggregate(last=Max('position'))['last']
            data = {**data, 'position': 0 if last is None else last + 1}
        return self._create_question(quiz, data)

    def publish(self, quiz: Quiz) -> Quiz:
        if not quiz.questions.exists():
            raise ValidationError("A quiz needs at least one question to be published.")
        quiz.status = Quiz.Status.PUBLISHED
        quiz.save(update_fields=['status', 'updated_at'])
        return quiz

    def _create_question(self, quiz: Quiz, data: dict) -> Question:
        self.check_annotation(quiz, data.get('annotation'))
        return Question.objects.create(quiz=quiz, **data)

    @staticmethod
    def check_annotation(quiz: Quiz, annotation) -> None:
        # An origin highlight from another studyspace would link two spaces.
        if annotation is not None and annotation.source.study_space_id != quiz.studyspace_id:
            raise ValidationError("The annotation belongs to a different studyspace.")
