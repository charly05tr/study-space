from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime


@dataclass(frozen=True)
class CardSchedule:
    """The scheduling state of a card, independent of any algorithm library.

    `state` uses the same integers as Flashcard.State (0 new, 1 learning,
    2 review, 3 relearning).
    """

    state: int
    step: int | None
    stability: float | None
    difficulty: float | None
    due: datetime
    last_review: datetime | None


class IScheduler(ABC):
    """Port for the spaced-repetition algorithm.

    Pure and deterministic: the clock is injected, nothing touches the
    database. Swapping the algorithm means writing another adapter.
    """

    @abstractmethod
    def new_card(self, now: datetime) -> CardSchedule:
        """The state of a card that has never been reviewed, due at `now`."""

    @abstractmethod
    def review(self, card: CardSchedule, rating: int, now: datetime) -> CardSchedule:
        """The state after rating the card (1 again, 2 hard, 3 good, 4 easy) at `now`."""
