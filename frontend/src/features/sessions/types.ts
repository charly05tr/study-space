/**
 * Shape of StudySessionSerializer.
 *
 * Durations travel as whole minutes rather than as DRF's `HH:MM:SS`: the client
 * needs them to fill a number input and to build a clock, and in both an
 * integer is the datum.
 */
export interface StudySession {
  id: number;
  goal: string;
  studyspace: number;
  studyspace_title: string;
  focus_minutes: number;
  rest_minutes: number;
  completed_pomodoros: number;
  /** StudySession.is_active — the session has no finished_at yet. */
  is_active: boolean;
  created_at: string;
  finished_at: string | null;
}

/** Body of POST /study-sessions/. */
export interface StartSessionPayload {
  goal: string;
  studyspace: number;
  focus_minutes: number;
  rest_minutes: number;
}

/** StudySessionService.MIN_MINUTES / MAX_MINUTES. */
export const MIN_MINUTES = 1;
export const MAX_MINUTES = 180;

export const clampMinutes = (value: number) =>
  Math.min(Math.max(Math.round(value) || MIN_MINUTES, MIN_MINUTES), MAX_MINUTES);

/**
 * The rhythms worth offering without asking anyone to think.
 *
 * The model's own defaults are 50/10, so that is the one that opens selected —
 * a form that disagrees with the server about what "normal" means is a form
 * that will surprise someone eventually.
 */
export interface Rhythm {
  label: string;
  focusMinutes: number;
  restMinutes: number;
}

export const RHYTHMS: Rhythm[] = [
  { label: 'Classic', focusMinutes: 25, restMinutes: 5 },
  { label: 'Long form', focusMinutes: 50, restMinutes: 10 },
  { label: 'Deep work', focusMinutes: 90, restMinutes: 20 },
];

export const DEFAULT_RHYTHM = RHYTHMS[1];
