import { cn } from '../../../components/ui';

const buttonClasses =
  'pointer-events-auto flex items-center justify-center rounded-xs border border-rule ' +
  'bg-page/90 text-muted backdrop-blur transition-colors ' +
  'hover:border-primary hover:text-ink ' +
  'disabled:pointer-events-none disabled:opacity-0';

interface FocusControlsProps {
  page: number;
  total: number;
  onPrevious: () => void;
  onNext: () => void;
  onExit: () => void;
}

/**
 * The only chrome visible in focus mode. Everything sits in a pointer-events-none
 * overlay so the reader can still select text through the gaps between controls.
 */
export const FocusControls = ({ page, total, onPrevious, onNext, onExit }: FocusControlsProps) => (
  <div className="pointer-events-none fixed inset-0 z-30">
    <button
      type="button"
      onClick={onPrevious}
      disabled={page <= 1}
      aria-label="Previous page"
      className={cn(buttonClasses, 'absolute top-1/2 left-4 size-11 -translate-y-1/2 text-xl')}
    >
      &lsaquo;
    </button>

    <button
      type="button"
      onClick={onNext}
      disabled={page >= total}
      aria-label="Next page"
      className={cn(buttonClasses, 'absolute top-1/2 right-4 size-11 -translate-y-1/2 text-xl')}
    >
      &rsaquo;
    </button>

    <button
      type="button"
      onClick={onExit}
      aria-label="Exit focus mode"
      // The header is gone in here, so this button is the only thing left that
      // can mention the key.
      title="Exit focus mode (F or Esc)"
      className={cn(buttonClasses, 'absolute top-4 right-4 h-9 px-3 font-heading text-xs uppercase tracking-[0.14em]')}
    >
      Exit
    </button>

    {total > 0 && (
      <span className="pointer-events-none absolute bottom-4 left-1/2 -translate-x-1/2 font-heading text-xs tabular-nums tracking-[0.14em] text-muted">
        {page} / {total}
      </span>
    )}
  </div>
);
