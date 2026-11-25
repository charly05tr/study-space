import { Button } from '../../../components/ui';

interface ConvertQuestionsBarProps {
  /** Questions that can still be converted (no flashcard yet). */
  selectableCount: number;
  selectedCount: number;
  converting: boolean;
  /** Why converting is unavailable, or null when it is available. */
  disabledReason: string | null;
  onToggleAll: () => void;
  onConvert: () => void;
}

/** Select-all checkbox plus the action that copies the ticked questions into flashcards. */
export const ConvertQuestionsBar = ({
  selectableCount,
  selectedCount,
  converting,
  disabledReason,
  onToggleAll,
  onConvert,
}: ConvertQuestionsBarProps) => {
  const allSelected = selectableCount > 0 && selectedCount === selectableCount;
  const blocked = disabledReason !== null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-y border-rule py-2">
      <label className="flex items-center gap-2 text-sm text-ink">
        <input
          type="checkbox"
          className="size-4 shrink-0 accent-primary"
          checked={allSelected}
          disabled={blocked || selectableCount === 0 || converting}
          onChange={onToggleAll}
        />
        Select all
        {selectedCount > 0 && <span className="text-muted">({selectedCount} selected)</span>}
      </label>

      <div className="flex flex-col items-end gap-1">
        <Button
          variant="secondary"
          size="sm"
          disabled={blocked || selectedCount === 0}
          loading={converting}
          aria-describedby="convert-hint"
          onClick={onConvert}
        >
          Convert to flashcards
        </Button>
        <p id="convert-hint" className="text-xs text-muted">
          {disabledReason ??
            (selectableCount === 0
              ? 'Every question already has a flashcard.'
              : 'Copies the ticked questions into independent flashcards.')}
        </p>
      </div>
    </div>
  );
};
