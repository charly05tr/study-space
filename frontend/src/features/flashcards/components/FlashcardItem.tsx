import { Badge, Button, ConfirmButton } from '../../../components/ui';
import type { BadgeVariant } from '../../../components/ui';
import { dueLabel, hasProgress } from '../flashcardList';
import { STATE_LABELS } from '../types';
import type { Flashcard, FlashcardState } from '../types';

interface FlashcardItemProps {
  card: Flashcard;
  now: Date;
  busy: boolean;
  resetting: boolean;
  deleting: boolean;
  onEdit: () => void;
  onReset: () => void;
  onDelete: () => void;
}

const STATE_VARIANTS: Record<FlashcardState, BadgeVariant> = {
  0: 'primary',
  1: 'neutral',
  2: 'success',
  3: 'danger',
};

/** One flashcard as the browse page lists it: both sides, its progress and its actions. */
export const FlashcardItem = ({
  card,
  now,
  busy,
  resetting,
  deleting,
  onEdit,
  onReset,
  onDelete,
}: FlashcardItemProps) => (
  <li className="flex flex-col gap-3 border-b border-rule py-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATE_VARIANTS[card.state]}>{STATE_LABELS[card.state]}</Badge>
        <span className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          {dueLabel(card, now)}
          {card.reps > 0 && ` · ${card.reps} ${card.reps === 1 ? 'review' : 'reviews'}`}
          {card.lapses > 0 && ` · ${card.lapses} ${card.lapses === 1 ? 'lapse' : 'lapses'}`}
        </span>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="quiet" size="sm" disabled={busy} onClick={onEdit}>
          Edit
        </Button>
        <ConfirmButton
          confirmLabel="Reset progress?"
          disabled={busy || !hasProgress(card)}
          loading={resetting}
          onConfirm={onReset}
        >
          Reset progress
        </ConfirmButton>
        <ConfirmButton
          confirmLabel="Delete card?"
          disabled={busy}
          loading={deleting}
          onConfirm={onDelete}
        >
          Delete
        </ConfirmButton>
      </div>
    </div>

    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">Front</p>
        <p className="mt-1 whitespace-pre-wrap text-ink">{card.front}</p>
      </div>
      <div>
        <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">Back</p>
        <p className="mt-1 whitespace-pre-wrap text-ink">{card.back}</p>
      </div>
    </div>
  </li>
);
