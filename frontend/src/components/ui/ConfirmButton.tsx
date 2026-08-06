import { useEffect, useRef, useState } from 'react';
import { Button } from './Button';
import type { ButtonSize } from './Button';

interface ConfirmButtonProps {
  /** Resting label, e.g. "Delete". */
  children: string;
  /** Label once armed. Say what goes, not just "Confirm". */
  confirmLabel: string;
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  size?: ButtonSize;
  className?: string;
}

/** How long the armed state waits before disarming itself. */
const ARMED_MS = 4000;

/**
 * A destructive action that takes two clicks.
 *
 * For deletes that carry more than the row you are looking at — a source takes
 * its highlights and its uploaded file, a note takes its blocks and every
 * relation drawn from them. None of that comes back, and a modal for it is more
 * ceremony than a second click on a button that has changed its mind.
 *
 * It disarms on its own so a half-pressed Delete does not sit there waiting to
 * be hit by the next click that happens to land on it.
 */
export const ConfirmButton = ({
  children,
  confirmLabel,
  onConfirm,
  loading = false,
  disabled = false,
  size = 'sm',
  className,
}: ConfirmButtonProps) => {
  const [armed, setArmed] = useState(false);
  // Kept in a ref so re-renders while armed do not restart the countdown.
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => {
    if (!armed) return;

    timer.current = setTimeout(() => setArmed(false), ARMED_MS);
    return () => clearTimeout(timer.current);
  }, [armed]);

  const handleClick = () => {
    if (!armed) {
      setArmed(true);
      return;
    }

    clearTimeout(timer.current);
    setArmed(false);
    onConfirm();
  };

  return (
    <Button
      variant="danger"
      size={size}
      loading={loading}
      disabled={disabled}
      className={className}
      onClick={handleClick}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
};
