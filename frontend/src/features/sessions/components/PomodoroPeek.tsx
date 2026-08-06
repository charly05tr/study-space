import { useEffect, useRef, useState } from 'react';
import { Button, cn } from '../../../components/ui';
import { useActiveSession } from '../hooks/useStudySessions';
import { usePomodoroRunner } from '../hooks/usePomodoroRunner';
import type { StudySession } from '../types';
import { PomodoroDial } from './PomodoroDial';

/** Diameter of the dial in here. The full panel's is twice this. */
const DIAL_SIZE = 104;

/**
 * Height of the strip left showing while it is closed, in rem.
 *
 * Enough for the clock and the phase, and nothing else. That is the whole
 * contract of this thing: a glance costs nothing, and anything more is a
 * decision you make on purpose.
 */
const HANDLE_REM = 1.75;

/**
 * How long the panel waits after the pointer leaves before closing.
 *
 * Crossing the tab on the way somewhere else should not open and shut it, and
 * reaching for Pause should not have it retract from under the cursor.
 */
const LINGER_MS = 450;

interface PomodoroPeekProps {
  studyspaceId: number;
  /** Held open by hand, from the "P" key or the handle. Outranks the pointer. */
  pinned: boolean;
  /**
   * Toggle rather than close: a touch screen has no hover, so tapping the
   * handle is the only way in, and it has to be the way back out too.
   */
  onTogglePin: () => void;
}

/**
 * The running timer, hanging off the top edge of the reader.
 *
 * Reading and timing are the same activity and two different pages, which used
 * to mean leaving the text to find out how long was left. This is the answer to
 * that, sized so it never becomes the thing you are looking at: closed it is a
 * clock and a coloured hairline, open it is a small dial and three verbs.
 *
 * It hangs rather than floats — the panel is anchored above the viewport and
 * slides down, so it reads as something tucked behind the top edge rather than
 * as a box that appeared over the page.
 */
export const PomodoroPeek = ({ studyspaceId, pinned, onTogglePin }: PomodoroPeekProps) => {
  const { data: session } = useActiveSession(studyspaceId);

  // Nothing running, nothing to peek at. The hooks below live in the inner
  // component precisely so this can return before them: the runner attaches a
  // timer to a session, and there is no session to attach one to.
  if (!session) return null;

  return (
    <Peek
      session={session}
      studyspaceId={studyspaceId}
      pinned={pinned}
      onTogglePin={onTogglePin}
    />
  );
};

interface PeekProps extends PomodoroPeekProps {
  session: StudySession;
}

const Peek = ({ session, studyspaceId, pinned, onTogglePin }: PeekProps) => {
  const runner = usePomodoroRunner(session, studyspaceId);
  const [hovered, setHovered] = useState(false);
  const linger = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => () => clearTimeout(linger.current), []);

  const open = pinned || hovered;
  const focus = runner?.timer.phase === 'focus';

  const handleEnter = () => {
    clearTimeout(linger.current);
    setHovered(true);
  };

  const handleLeave = () => {
    clearTimeout(linger.current);
    linger.current = setTimeout(() => setHovered(false), LINGER_MS);
  };

  if (!runner) return null;

  return (
    /* The strip spans the width so the panel can centre in it, and lets the
       pointer through so it does not sit over the header's buttons. */
    <div className="pointer-events-none fixed inset-x-0 top-0 z-30 flex justify-center">
      <div
        // The handlers live here and not on the strip above: that one is
        // pointer-events-none, so it never receives a pointer to begin with.
        onPointerEnter={handleEnter}
        onPointerLeave={handleLeave}
        className={cn(
          'pointer-events-auto flex w-64 flex-col rounded-b-xs border border-t-0 border-rule bg-page shadow-lg',
          'transition-transform duration-300 ease-out motion-reduce:transition-none',
        )}
        // Closed, the panel sits above the viewport with only the handle below
        // the edge. A transform and not height: it does not reflow the reader,
        // and the browser can hand the whole thing to the compositor.
        style={{ transform: open ? 'translateY(0)' : `translateY(calc(-100% + ${HANDLE_REM}rem))` }}
      >
        {/* The body. aria-hidden while closed so a screen reader is not offered
            three buttons that are sitting off screen. */}
        <div
          aria-hidden={!open}
          className={cn(
            'flex flex-col items-center gap-3 px-4 pt-4',
            'transition-opacity duration-200 motion-reduce:transition-none',
            open ? 'opacity-100' : 'opacity-0',
          )}
        >
          <p className="w-full truncate text-center text-sm text-muted" title={session.goal}>
            {session.goal}
          </p>

          {/* Small enough to read at a glance and be done with it. Same drawing
              as the full panel's, just told a smaller number. */}
          <PomodoroDial
            phase={runner.timer.phase}
            progress={runner.progress}
            clock={runner.clock}
            running={runner.running}
            size={DIAL_SIZE}
          />

          <div className="flex flex-wrap items-center justify-center gap-1">
            <Button
              variant="quiet"
              size="sm"
              tabIndex={open ? undefined : -1}
              onClick={runner.running ? runner.pause : runner.resume}
            >
              {runner.running ? 'Pause' : 'Resume'}
            </Button>
            <Button
              variant="quiet"
              size="sm"
              tabIndex={open ? undefined : -1}
              onClick={runner.next}
            >
              Skip
            </Button>
            <Button
              variant="quiet"
              size="sm"
              tabIndex={open ? undefined : -1}
              aria-pressed={runner.soundOn}
              aria-label={runner.soundOn ? 'Mute the chime' : 'Unmute the chime'}
              onClick={runner.toggleSound}
            >
              {runner.soundOn ? 'Sound' : 'Muted'}
            </Button>
          </div>
        </div>

        {/*
          The handle — the piece that stays visible. A button, not a strip of
          text: it is the affordance, so it has to be reachable by keyboard and
          say what it does. It is also the whole widget on a touch screen, where
          there is no pointer to hover with.
        */}
        <button
          type="button"
          aria-expanded={open}
          aria-label={`${focus ? 'Focus' : 'Rest'}, ${runner.clock} remaining. Keep the timer open, or press P.`}
          onClick={onTogglePin}
          onFocus={handleEnter}
          className="group relative flex w-full items-center justify-center gap-2 px-3"
          style={{ height: `${HANDLE_REM}rem` }}
        >
          {/* The phase's own colour, as a line that fills across the handle.
              Closed, this is the only thing moving on the page — which is the
              right amount of movement for something you are not reading. */}
          <span
            aria-hidden="true"
            className={cn(
              'absolute inset-x-0 bottom-0 h-px origin-left',
              'transition-transform duration-500 ease-linear motion-reduce:transition-none',
              focus ? 'bg-primary' : 'bg-success',
            )}
            style={{ transform: `scaleX(${runner.progress})` }}
          />

          <span
            className={cn(
              'font-heading text-xs tabular-nums text-ink transition-opacity',
              !runner.running && 'opacity-45',
            )}
          >
            {runner.clock}
          </span>
          <span className="font-heading text-[0.6rem] uppercase tracking-[0.18em] text-muted">
            {runner.running ? (focus ? 'Focus' : 'Rest') : 'Paused'}
          </span>
        </button>
      </div>
    </div>
  );
};
