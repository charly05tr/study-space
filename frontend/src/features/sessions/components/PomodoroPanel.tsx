import { useEffect, useRef, useState } from 'react';
import { Badge, Button, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import {
  formatClock,
  isRunning,
  progressOf,
  remainingMs,
  type Durations,
} from '../pomodoro';
import { useCompletePomodoro, useFinishSession } from '../hooks/useStudySessions';
import { usePomodoroStore } from '../store/pomodoroStore';
import type { StudySession } from '../types';
import { PomodoroDial } from './PomodoroDial';

/**
 * How often the dial re-reads the clock.
 *
 * Not the length of a second, and it does not have to be: nothing counts these
 * ticks — the time is derived from `Date.now()` on every render. Four a second
 * only means the displayed second turns over within 250ms of the real one.
 */
const TICK_MS = 250;

interface PomodoroPanelProps {
  session: StudySession;
  studyspaceId: number;
}

export const PomodoroPanel = ({ session, studyspaceId }: PomodoroPanelProps) => {
  const { notify } = useNotification();
  const completePomodoro = useCompletePomodoro(studyspaceId);
  const finishSession = useFinishSession(studyspaceId);

  const timer = usePomodoroStore((state) => state.timer);
  const attachedTo = usePomodoroStore((state) => state.sessionId);
  const attach = usePomodoroStore((state) => state.attach);
  const detach = usePomodoroStore((state) => state.detach);
  const pauseTimer = usePomodoroStore((state) => state.pauseTimer);
  const resumeTimer = usePomodoroStore((state) => state.resumeTimer);
  const restartPhase = usePomodoroStore((state) => state.restartPhase);
  const nextPhase = usePomodoroStore((state) => state.nextPhase);

  const [now, setNow] = useState(() => Date.now());

  const durations: Durations = {
    focusMinutes: session.focus_minutes,
    restMinutes: session.rest_minutes,
  };

  // Adopting an existing timer rather than restarting it is what makes a reload
  // mid-phase invisible: the store kept the wall-clock marks, so the phase
  // resumes where it would be, not where it was left.
  useEffect(() => {
    attach(session.id);
  }, [attach, session.id]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(interval);
  }, []);

  const ours = attachedTo === session.id && timer !== null;
  const remaining = ours ? remainingMs(timer, durations, now) : 0;

  /**
   * Which phase we last handed over. A phase ends by its remaining time
   * reaching zero, which stays true on every tick until something moves — so
   * without this the handover would fire four times a second.
   */
  const handedOver = useRef<string | null>(null);

  useEffect(() => {
    if (!ours || remaining > 0) return;

    const stamp = `${timer.phase}-${timer.startedAt}-${timer.carried}`;
    if (handedOver.current === stamp) return;
    handedOver.current = stamp;

    if (timer.phase === 'focus') {
      // Counted by the server, so the record survives this tab.
      completePomodoro.mutate(session.id, {
        onError: (error) =>
          notify({
            variant: 'error',
            title: 'Could not record the pomodoro',
            message: getApiErrorMessage(error),
          }),
      });
      notify({
        variant: 'success',
        title: 'Focus complete',
        message: `Take ${session.rest_minutes} minutes.`,
      });
    } else {
      notify({ title: 'Break over', message: 'Back to it.' });
    }

    nextPhase();
  }, [
    completePomodoro,
    notify,
    nextPhase,
    ours,
    remaining,
    session.id,
    session.rest_minutes,
    timer,
  ]);

  const handleFinish = () => {
    finishSession.mutate(session.id, {
      onSuccess: () => {
        detach();
        notify({
          variant: 'success',
          title: 'Session closed',
          message: `${session.completed_pomodoros} pomodoro${
            session.completed_pomodoros === 1 ? '' : 's'
          } on "${session.goal}".`,
        });
      },
      onError: (error) =>
        notify({
          variant: 'error',
          title: 'Could not close the session',
          message: getApiErrorMessage(error),
        }),
    });
  };

  if (!ours) return null;

  const running = isRunning(timer);

  return (
    <div className="flex flex-col items-center gap-6 rounded-xs border border-rule px-4 py-8 sm:flex-row sm:items-center sm:gap-10 sm:px-8">
      <PomodoroDial
        phase={timer.phase}
        progress={progressOf(timer, durations, now)}
        clock={formatClock(remaining)}
        running={running}
      />

      <div className="flex min-w-0 flex-1 flex-col gap-5 text-center sm:text-left">
        <div className="flex flex-col gap-2">
          <span className="font-heading text-xs uppercase tracking-[0.18em] text-muted">
            Working on
          </span>
          <p className="font-heading text-2xl text-ink">{session.goal}</p>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Badge variant={session.completed_pomodoros > 0 ? 'primary' : 'neutral'}>
            {session.completed_pomodoros} done
          </Badge>
          <Badge>
            {session.focus_minutes} / {session.rest_minutes} min
          </Badge>
        </div>

        <div className="flex flex-wrap items-center justify-center gap-2 sm:justify-start">
          <Button size="sm" onClick={running ? pauseTimer : resumeTimer}>
            {running ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="quiet" size="sm" onClick={restartPhase}>
            Restart phase
          </Button>
          {/* Skipping does NOT count the pomodoro: the record is what you sat
              through, not what you scheduled. */}
          <Button variant="quiet" size="sm" onClick={nextPhase}>
            Skip to {timer.phase === 'focus' ? 'rest' : 'focus'}
          </Button>
          <Button
            variant="secondary"
            size="sm"
            loading={finishSession.isPending}
            onClick={handleFinish}
          >
            End session
          </Button>
        </div>
      </div>
    </div>
  );
};
