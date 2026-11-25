from abc import ABC, abstractmethod
from dataclasses import dataclass
from datetime import datetime
from enum import IntEnum


class CardState(IntEnum):
    """Where a card is in its life. Same integers as Flashcard.State, which is
    what gets stored; a test keeps the two aligned."""

    NEW = 0
    LEARNING = 1
    REVIEW = 2
    RELEARNING = 3


class Rating(IntEnum):
    """How well the card was remembered. Same integers as ReviewLog.Rating."""

    AGAIN = 1
    HARD = 2
    GOOD = 3
    EASY = 4


@dataclass(frozen=True)
class CardSchedule:
    """The scheduling state of a card, independent of any algorithm library.

    `state` holds a CardState value.
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
