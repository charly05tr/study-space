/**
 * Shape of PlannedSessionSerializer.
 *
 * A planned session is the counterpart of a StudySession: that one records what
 * happened, this one holds what is meant to happen. They are linked by
 * `study_session` the moment the block is actually started.
 */
export interface PlannedSession {
  id: number;
  goal: string;
  studyspace: number;
  studyspace_title: string;
  /** ISO 8601, UTC. The absolute instant. */
  starts_at: string;
  ends_at: string;
  /** Derived server-side from the two ends; never sent by the client. */
  duration_minutes: number;
  /** IANA zone the block was planned in — the email formats with it. */
  timezone: string;
  /** `null` means no reminder at all, which is not the same as zero. */
  reminder_offset_minutes: number | null;
  reminder_sent_at: string | null;
  status: PlannedSessionStatus;
  /** The real session, once this block was started. */
  study_session: number | null;
  created_at: string;
  updated_at: string;
}

export type PlannedSessionStatus =
  | 'planned'
  | 'started'
  | 'completed'
  | 'missed'
  | 'cancelled';

/** Body of POST /planned-sessions/. */
export interface CreatePlannedSessionPayload {
  goal: string;
  studyspace: number;
  starts_at: string;
  ends_at: string;
  timezone: string;
  reminder_offset_minutes: number | null;
}

/** Body of PATCH /planned-sessions/{id}/ — every field optional. */
export type UpdatePlannedSessionPayload = Partial<
  Omit<CreatePlannedSessionPayload, 'studyspace'>
>;

/** Body of POST /planned-sessions/{id}/start/. */
export interface StartPlannedSessionPayload {
  focus_minutes: number;
  rest_minutes: number;
}

/** PlannedSessionService.MIN_DURATION / MAX_DURATION, in minutes. */
export const MIN_DURATION_MINUTES = 5;
export const MAX_DURATION_MINUTES = 12 * 60;

/**
 * The reminder offsets worth offering without opening a number input.
 *
 * `null` is a real choice and not an empty state: planning a block you already
 * know you will not forget is a normal thing to want.
 */
export interface ReminderChoice {
  label: string;
  minutes: number | null;
}

export const REMINDER_CHOICES: ReminderChoice[] = [
  { label: 'No reminder', minutes: null },
  { label: '15 min before', minutes: 15 },
  { label: '1 hour before', minutes: 60 },
  { label: '1 day before', minutes: 24 * 60 },
];

/** The server's default, so the form opens agreeing with it. */
export const DEFAULT_REMINDER_MINUTES = 60;

/** How long a block lasts by default, so one click is enough to plan one. */
export const DEFAULT_BLOCK_MINUTES = 120;

export const STATUS_LABELS: Record<PlannedSessionStatus, string> = {
  planned: 'Planned',
  started: 'Started',
  completed: 'Completed',
  missed: 'Missed',
  cancelled: 'Cancelled',
};
