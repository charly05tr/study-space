import { useEffect, useRef, useState } from 'react';
import { useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { playChime } from '../chime';
import {
  formatClock,
  isRunning,
  progressOf,
  remainingMs,
  type Durations,
  type PomodoroState,
} from '../pomodoro';
import { usePomodoroStore } from '../store/pomodoroStore';
import type { StudySession } from '../types';
import { useCompletePomodoro } from './useStudySessions';

/**
 * How often the clock is re-read.
 *
 * Not the length of a second, and it does not have to be: nothing counts these
 * ticks — the time is derived from `Date.now()` on every render. Four a second
 * only means the displayed second turns over within 250ms of the real one.
 */
const TICK_MS = 250;

export interface PomodoroRunner {
  timer: PomodoroState;
  durations: Durations;
  /** Milliseconds left in the phase. */
  remaining: number;
  /** 0 to 1 through the phase. */
  progress: number;
  /** `MM:SS` of `remaining`. */
  clock: string;
  running: boolean;
  soundOn: boolean;
  pause: () => void;
  resume: () => void;
  restart: () => void;
  next: () => void;
  toggleSound: () => void;
}

/**
 * Drives one session's timer: the tick, and the handover at the end of a phase.
 *
 * A hook and not a component because the handover has SIDE EFFECTS — it records
 * the pomodoro on the server and it rings — and those must happen exactly once
 * no matter how many things are drawing the clock. Two components each running
 * their own copy would double-count every pomodoro the day both are on screen.
 *
 * Returns null while no timer belongs to this session, which is the first render
 * and any moment the store is pointed at a different one.
 */
export const usePomodoroRunner = (
  session: StudySession,
  studyspaceId: number,
): PomodoroRunner | null => {
  const { notify } = useNotification();
  const completePomodoro = useCompletePomodoro(studyspaceId);

  const timer = usePomodoroStore((state) => state.timer);
  const attachedTo = usePomodoroStore((state) => state.sessionId);
  const soundOn = usePomodoroStore((state) => state.soundOn);
  const attach = usePomodoroStore((state) => state.attach);
  const pauseTimer = usePomodoroStore((state) => state.pauseTimer);
  const resumeTimer = usePomodoroStore((state) => state.resumeTimer);
  const restartPhase = usePomodoroStore((state) => state.restartPhase);
  const nextPhase = usePomodoroStore((state) => state.nextPhase);
  const toggleSound = usePomodoroStore((state) => state.toggleSound);

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
  /**
   * The phase we watched while it was still running.
   *
   * Only that one is worth ringing for. The timer's position survives the tab
   * being closed, so reopening the app an hour after a phase ran out reaches the
   * handover on the first tick — the pomodoro is still recorded, because it was
   * still worked, but a bell for something that ended an hour ago announces
   * nothing.
   */
  const sawRunning = useRef<string | null>(null);

  useEffect(() => {
    if (!ours) return;

    const stamp = `${timer.phase}-${timer.startedAt}-${timer.carried}`;
    if (remaining > 0) {
      sawRunning.current = stamp;
      return;
    }

    if (handedOver.current === stamp) return;
    handedOver.current = stamp;

    const announce = sawRunning.current === stamp;

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

    if (announce && soundOn) playChime(timer.phase === 'focus' ? 'focusEnd' : 'restEnd');

    nextPhase();
  }, [
    completePomodoro,
    notify,
    nextPhase,
    ours,
    remaining,
    session.id,
    session.rest_minutes,
    soundOn,
    timer,
  ]);

  if (!ours) return null;

  return {
    timer,
    durations,
    remaining,
    progress: progressOf(timer, durations, now),
    clock: formatClock(remaining),
    running: isRunning(timer),
    soundOn,
    pause: pauseTimer,
    resume: resumeTimer,
    restart: restartPhase,
    next: nextPhase,
    toggleSound,
  };
};
