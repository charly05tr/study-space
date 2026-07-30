import { cn } from '../../../components/ui';
import type { Phase } from '../pomodoro';

const SIZE = 208;
const RADIUS = 94;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

interface PomodoroDialProps {
  phase: Phase;
  /** 0 to 1. */
  progress: number;
  /** `MM:SS` left in the phase. */
  clock: string;
  running: boolean;
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
export const PomodoroDial = ({ phase, progress, clock, running }: PomodoroDialProps) => {
  const focus = phase === 'focus';

  return (
    <div
      role="timer"
      // Deliberately not a live region: a clock that announces itself every
      // second is unusable with a screen reader. The phase changes announce.
      aria-label={`${focus ? 'Focus' : 'Rest'}, ${clock} remaining`}
      className="relative grid shrink-0 place-items-center"
      style={{ width: SIZE, height: SIZE }}
    >
      <svg
        width={SIZE}
        height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        aria-hidden="true"
        // From twelve o'clock, like every other dial anyone has read.
        className="-rotate-90"
      >
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={1}
          className="stroke-rule"
        />
        <circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          fill="none"
          strokeWidth={2.5}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - progress)}
          className={cn(
            'transition-[stroke-dashoffset] duration-500 ease-linear motion-reduce:transition-none',
            focus ? 'stroke-primary' : 'stroke-success',
          )}
        />
      </svg>

      <div className="absolute flex flex-col items-center gap-1">
        <span
          className={cn(
            'font-heading text-6xl leading-none tabular-nums text-ink',
            // Paused reads as suspended, not as broken: the clock stays legible
            // and only loses its weight in the page.
            !running && 'opacity-45',
          )}
        >
          {clock}
        </span>
        <span className="font-heading text-xs uppercase tracking-[0.22em] text-muted">
          {running ? (focus ? 'Focus' : 'Rest') : 'Paused'}
        </span>
      </div>
    </div>
  );
};
