from datetime import datetime

from fsrs import Card, Rating, Scheduler, State

from apps.studyspace.services.scheduler import CardSchedule, IScheduler


class FsrsScheduler(IScheduler):
    """IScheduler backed by the `fsrs` package (py-fsrs).

    Fuzzing is off by default: it adds randomness to the intervals, and a
    scheduler that gives different answers for the same input cannot be tested
    or replayed from the review log.
    """

    def __init__(self, desired_retention: float = 0.9, enable_fuzzing: bool = False):
        self._scheduler = Scheduler(
            desired_retention=desired_retention,
            enable_fuzzing=enable_fuzzing,
        )

    def new_card(self, now: datetime) -> CardSchedule:
        return CardSchedule(
            state=0, step=None, stability=None, difficulty=None, due=now, last_review=None
        )

    def review(self, card: CardSchedule, rating: int, now: datetime) -> CardSchedule:
        updated, _ = self._scheduler.review_card(
            self._to_fsrs(card), Rating(rating), review_datetime=now
        )
        return CardSchedule(
            state=int(updated.state.value),
            step=updated.step,
            stability=updated.stability,
            difficulty=updated.difficulty,
            due=updated.due,
            last_review=updated.last_review,
        )

    @staticmethod
    def _to_fsrs(card: CardSchedule) -> Card:
        # FSRS has no "new" state: an unreviewed card is a learning card at
        # step 0 with no stability yet.
        state = State.Learning if card.state == 0 else State(card.state)
        return Card(
            card_id=0,  # not used by the algorithm; avoids the clock-based default
            state=state,
            step=card.step,
            stability=card.stability,
            difficulty=card.difficulty,
            due=card.due,
            last_review=card.last_review,
        )
