from datetime import datetime

from django.db import transaction
from django.db.models import Count, Q

from apps.studyspace.models import Flashcard, Question, Quiz, ReviewLog
from apps.studyspace.services.fsrs_scheduler import FsrsScheduler
from apps.studyspace.services.scheduler import CardSchedule, IScheduler
from apps.users.models import User

_VALID_RATINGS = {choice.value for choice in ReviewLog.Rating}

# Rendered into the back of a converted card.
_TRUE_FALSE_LABELS = {True: 'True', False: 'False'}


class FlashcardService:
    """Flashcards, their review and the due queue.

    The clock is always passed in (`now`) so every rule here is testable
    without freezing time.
    """

    def __init__(self, scheduler: IScheduler | None = None):
        self.scheduler = scheduler or FsrsScheduler()

    # --- reads -------------------------------------------------------------

    def get_user_flashcards(self, user: User):
        return Flashcard.objects.filter(studyspace__user=user)

    def due_queue(self, user: User, now: datetime, studyspace=None, new_limit: int | None = None):
        """Cards due at `now`, oldest first.

        `new_limit` caps how many never-reviewed cards enter the queue, so a
        space with hundreds of fresh cards does not bury the reviews.
        Cards of draft quizzes never show up.
        """
        due = (
            self.get_user_flashcards(user)
            .filter(due__lte=now)
            .exclude(question__quiz__status=Quiz.Status.DRAFT)
        )
        if studyspace is not None:
            due = due.filter(studyspace=studyspace)

        if new_limit is None:
            return due.order_by('due', 'id')

        new_ids = list(
            due.filter(state=Flashcard.State.NEW)
            .order_by('created_at', 'id')
            .values_list('pk', flat=True)[:new_limit]
        )
        return (
            due.filter(Q(pk__in=new_ids) | ~Q(state=Flashcard.State.NEW))
            .order_by('due', 'id')
        )

    def stats(self, user: User, now: datetime, studyspace=None) -> list[dict]:
        """Per studyspace: `total` cards, `new` never reviewed, `due` reviewed
        cards whose due date has passed. New cards are not counted as due, so
        the two numbers add up to the work available today."""
        cards = self.get_user_flashcards(user).exclude(
            question__quiz__status=Quiz.Status.DRAFT
        )
        if studyspace is not None:
            cards = cards.filter(studyspace=studyspace)

        rows = (
            cards.values('studyspace_id')
            .annotate(
                total=Count('id'),
                new=Count('id', filter=Q(state=Flashcard.State.NEW)),
                due=Count('id', filter=Q(due__lte=now) & ~Q(state=Flashcard.State.NEW)),
            )
            .order_by('studyspace_id')
        )
        return [
            {
                'studyspace': row['studyspace_id'],
                'total': row['total'],
                'new': row['new'],
                'due': row['due'],
            }
            for row in rows
        ]

    # --- writes ------------------------------------------------------------

    @transaction.atomic
    def review(self, flashcard: Flashcard, rating: int, now: datetime) -> Flashcard:
        """Rate a card: update its schedule and write the log, or neither.

        Reviewing a card that is not due yet is allowed; it is logged as is.
        """
        if rating not in _VALID_RATINGS:
            raise ValueError(f"Invalid rating: {rating}")

        after = self.scheduler.review(self._schedule_of(flashcard), rating, now)

        ReviewLog.objects.create(
            flashcard=flashcard,
            rating=rating,
            reviewed_at=now,
            state_before=flashcard.state,
            due_before=flashcard.due,
            due_after=after.due,
        )

        # A lapse is forgetting a card that was already learned.
        if rating == ReviewLog.Rating.AGAIN and flashcard.state in (
            Flashcard.State.REVIEW,
            Flashcard.State.RELEARNING,
        ):
            flashcard.lapses += 1
        flashcard.reps += 1
        self._apply_schedule(flashcard, after)
        flashcard.save()
        return flashcard

    @transaction.atomic
    def reset_progress(self, flashcard: Flashcard, now: datetime) -> Flashcard:
        """Back to a brand-new card. The review history is kept."""
        self._apply_schedule(flashcard, self.scheduler.new_card(now))
        flashcard.reps = 0
        flashcard.lapses = 0
        flashcard.save()
        return flashcard

    @transaction.atomic
    def convert_questions(self, user: User, question_ids: list[int], now: datetime) -> dict:
        """Copy questions into flashcards of their studyspace.

        Idempotent: a question that already has a card is skipped. Questions
        that are not the user's come back as `not_found` and questions of a
        draft quiz as `not_published`; neither is converted.
        """
        ordered = list(dict.fromkeys(question_ids))
        questions = {
            question.pk: question
            for question in Question.objects.filter(
                pk__in=ordered, quiz__studyspace__user=user
            ).select_related('quiz__studyspace')
        }
        already = set(
            Flashcard.objects.filter(question_id__in=questions).values_list('question_id', flat=True)
        )

        created, skipped, not_published = [], [], []
        for question_id in ordered:
            question = questions.get(question_id)
            if question is None:
                continue
            if question.quiz.status != Quiz.Status.PUBLISHED:
                not_published.append(question_id)
            elif question_id in already:
                skipped.append(question_id)
            else:
                created.append(self._card_from(question, now))

        return {
            'created': created,
            'skipped': skipped,
            'not_published': not_published,
            'not_found': [qid for qid in ordered if qid not in questions],
        }

    # --- helpers -----------------------------------------------------------

    def _card_from(self, question: Question, now: datetime) -> Flashcard:
        card = Flashcard(
            studyspace=question.quiz.studyspace,
            question=question,
            front=question.prompt,
            back=render_answer(question),
        )
        self._apply_schedule(card, self.scheduler.new_card(now))
        card.save()
        return card

    @staticmethod
    def _schedule_of(card: Flashcard) -> CardSchedule:
        return CardSchedule(
            state=card.state,
            step=card.step,
            stability=card.stability,
            difficulty=card.difficulty,
            due=card.due,
            last_review=card.last_review,
        )

    @staticmethod
    def _apply_schedule(card: Flashcard, schedule: CardSchedule) -> None:
        card.state = schedule.state
        card.step = schedule.step
        card.stability = schedule.stability
        card.difficulty = schedule.difficulty
        card.due = schedule.due
        card.last_review = schedule.last_review


def render_answer(question: Question) -> str:
    """The back of a card: the reference answer as text, plus the explanation."""
    kind = question.question_type
    answer = question.correct_answer

    if kind == Question.QuestionType.MULTIPLE_CHOICE:
        options = question.options or []
        valid = isinstance(answer, int) and not isinstance(answer, bool) and 0 <= answer < len(options)
        text = str(options[answer]) if valid else ''
    elif kind == Question.QuestionType.TRUE_FALSE:
        text = _TRUE_FALSE_LABELS.get(answer, '')
    else:
        text = str(answer or '')

    if question.explanation:
        return f"{text}\n\n{question.explanation}" if text else question.explanation
    return text
