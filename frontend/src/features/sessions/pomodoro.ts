export type Phase = 'focus' | 'rest';

export const MINUTE_MS = 60_000;

export interface Durations {
  focusMinutes: number;
  restMinutes: number;
}

/**
 * A pomodoro phase in progress.
 *
 * Time is held as WALL-CLOCK marks, never as a countdown the app decrements.
 * A timer built on tick counting is wrong the moment the tab loses focus:
 * browsers clamp background intervals to a second and suspend them outright on
 * a sleeping machine, so twenty-five real minutes come back as eleven. Deriving
 * the elapsed time from `Date.now()` makes the interval a repaint trigger and
 * nothing more — the answer is the same whether it fired six hundred times or
 * twice.
 */
export interface PomodoroState {
  phase: Phase;
  /** Epoch ms when the current running stretch began. Null while paused. */
  startedAt: number | null;
  /** Milliseconds already spent in this phase, from stretches before this one. */
  carried: number;
}

export const isRunning = (state: PomodoroState) => state.startedAt !== null;

export const durationOf = (phase: Phase, durations: Durations) =>
  (phase === 'focus' ? durations.focusMinutes : durations.restMinutes) * MINUTE_MS;

export const elapsedMs = (state: PomodoroState, now: number) =>
  // A clock that moved backwards — a manual change, an NTP correction — must
  // not hand back time already spent.
  state.carried + (state.startedAt === null ? 0 : Math.max(0, now - state.startedAt));

export const remainingMs = (state: PomodoroState, durations: Durations, now: number) =>
  Math.max(0, durationOf(state.phase, durations) - elapsedMs(state, now));

/** How far through the phase, from 0 to 1. */
export const progressOf = (state: PomodoroState, durations: Durations, now: number) => {
  const total = durationOf(state.phase, durations);
  if (total <= 0) return 1;
  return Math.min(1, elapsedMs(state, now) / total);
};

export const beginPhase = (phase: Phase, now: number): PomodoroState => ({
  phase,
  startedAt: now,
  carried: 0,
});

export const pause = (state: PomodoroState, now: number): PomodoroState =>
  state.startedAt === null ? state : { ...state, startedAt: null, carried: elapsedMs(state, now) };

export const resume = (state: PomodoroState, now: number): PomodoroState =>
  state.startedAt === null ? { ...state, startedAt: now } : state;

/** Back to the top of the phase you are already in. */
export const restart = (state: PomodoroState, now: number): PomodoroState =>
  beginPhase(state.phase, now);

/** On to the other phase, running. Focus and rest alternate; nothing else. */
export const advance = (state: PomodoroState, now: number): PomodoroState =>
  beginPhase(state.phase === 'focus' ? 'rest' : 'focus', now);

/**
 * `MM:SS` of time left, rounded UP.
 *
 * Rounding down would open a twenty-five minute phase reading 24:59, and would
 * show 00:00 for a whole second before the phase actually ends.
 */
export const formatClock = (ms: number) => {
  const seconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};

/** Total time a finished session covered, as `1h 20m`. Null while it runs. */
export const formatSpan = (startIso: string, endIso: string | null) => {
  if (!endIso) return null;
  const span = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(span) || span < 0) return null;

  const minutes = Math.round(span / MINUTE_MS);
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
};
