import { cn } from '../../../components/ui';
import type { Phase } from '../pomodoro';

const DEFAULT_SIZE = 208;
/** Distance from the edge of the box to the ring, so the stroke never clips. */
const RING_INSET = 10;

interface PomodoroDialProps {
  phase: Phase;
  /** 0 to 1. */
  progress: number;
  /** `MM:SS` left in the phase. */
  clock: string;
  running: boolean;
  /**
   * Diameter in px. The type inside scales with it, so the small dial in the
   * reader is the same drawing rather than a second one that has to be kept
   * looking like the first.
   */
  size?: number;
}

/**
 * The face of the timer: one hairline ring, the time, and the phase.
 *
 * A ring rather than a bar because the shape says "a cycle" before any label
 * does, and because a full-width bar would make the timer the loudest thing on
 * a page whose whole point is the reading underneath it.
 *
 * Focus wears goldenrod and rest wears sage — the palette's own two accents.
 * The colour is never the only signal: the phase is written under the clock,
 * so it survives both a colourblind reader and a printed page.
 */
export const PomodoroDial = ({
  phase,
  progress,
  clock,
  running,
  size = DEFAULT_SIZE,
}: PomodoroDialProps) => {
  const focus = phase === 'focus';
  const radius = size / 2 - RING_INSET;
  const circumference = 2 * Math.PI * radius;

  return (
    <div
      role="timer"
      // Deliberately not a live region: a clock that announces itself every
      // second is unusable with a screen reader. The phase changes announce.
      aria-label={`${focus ? 'Focus' : 'Rest'}, ${clock} remaining`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        aria-hidden="true"
        // From twelve o'clock, like every other dial anyone has read.
        className="-rotate-90"
      >
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={1}
          className="stroke-rule"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - progress)}
          className={cn(
            'transition-[stroke-dashoffset] duration-500 ease-linear motion-reduce:transition-none',
            focus ? 'stroke-primary' : 'stroke-success',
          )}
        />
      </svg>

      <div className="absolute flex flex-col items-center gap-1">
        <span
          // The ratios are the full-size dial's own: 60px of clock and 12px of
          // caption inside 208. Written as arithmetic so one number moves both.
          style={{ fontSize: size * 0.29 }}
          className={cn(
            'font-heading leading-none tabular-nums text-ink',
            // Paused reads as suspended, not as broken: the clock stays legible
            // and only loses its weight in the page.
            !running && 'opacity-45',
          )}
        >
          {clock}
        </span>
        <span
          // Floored: below about 9px the caption stops being readable, and a
          // small dial would rather have a slightly large label than no label.
          style={{ fontSize: Math.max(9, size * 0.058) }}
          className="font-heading uppercase tracking-[0.22em] text-muted"
        >
          {running ? (focus ? 'Focus' : 'Rest') : 'Paused'}
        </span>
      </div>
    </div>
  );
};
