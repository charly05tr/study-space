import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Button,
  cn,
  ErrorState,
  Input,
  Select,
  useNotification,
} from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { DEFAULT_RHYTHM } from '../../sessions/types';
import {
  addMinutesToTime,
  browserTimeZone,
  combineDateAndTime,
  formatDuration,
  minutesBetween,
  timeValue,
} from '../calendar';
import {
  useCancelPlannedSession,
  useCreatePlannedSession,
  useDeletePlannedSession,
  useStartPlannedSession,
  useUpdatePlannedSession,
} from '../hooks/usePlannedSessions';
import {
  DEFAULT_BLOCK_MINUTES,
  DEFAULT_REMINDER_MINUTES,
  MAX_DURATION_MINUTES,
  MIN_DURATION_MINUTES,
  REMINDER_CHOICES,
  STATUS_LABELS,
  type PlannedSession,
} from '../types';

interface PlanSessionCardProps {
  studyspaceId: number;
  /** The day whose cell was clicked. Local midnight. */
  day: Date;
  /** The block being edited, or undefined when planning a new one. */
  session?: PlannedSession;
  /** Flip the card so it stays on screen near the right edge / bottom rows. */
  alignRight: boolean;
  alignTop: boolean;
  onClose: () => void;
}

const DEFAULT_START = '09:00';

/**
 * The floating card a day cell opens.
 *
 * Anchored to the cell rather than shown as a modal: you are pointing at a day
 * on a grid, and a dialog in the middle of the screen would take that day off
 * screen at the moment you are deciding about it.
 *
 * It flips towards the middle of the grid from the outer columns and the lower
 * rows. The flip is driven by the cell's position, which is known statically —
 * seven columns and six rows — so nothing has to be measured after paint.
 */
export const PlanSessionCard = ({
  studyspaceId,
  day,
  session,
  alignRight,
  alignTop,
  onClose,
}: PlanSessionCardProps) => {
  const { notify } = useNotification();
  const container = useRef<HTMLDivElement>(null);

  const create = useCreatePlannedSession(studyspaceId);
  const update = useUpdatePlannedSession(studyspaceId);
  const cancel = useCancelPlannedSession(studyspaceId);
  const remove = useDeletePlannedSession(studyspaceId);
  const start = useStartPlannedSession(studyspaceId);

  const editing = Boolean(session);

  const [goal, setGoal] = useState(session?.goal ?? '');
  const [startTime, setStartTime] = useState(
    session ? timeValue(new Date(session.starts_at)) : DEFAULT_START,
  );
  const [endTime, setEndTime] = useState(
    session
      ? timeValue(new Date(session.ends_at))
      : addMinutesToTime(DEFAULT_START, DEFAULT_BLOCK_MINUTES),
  );
  const [reminder, setReminder] = useState<number | null>(
    session ? session.reminder_offset_minutes : DEFAULT_REMINDER_MINUTES,
  );

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [onClose]);

  const pending =
    create.isPending || update.isPending || cancel.isPending || remove.isPending || start.isPending;
  const failure = create.error ?? update.error ?? start.error ?? cancel.error ?? remove.error;
  const fieldErrors = getFieldErrors(create.error ?? update.error);

  const trimmed = goal.trim();
  const durationMinutes = minutesBetween(startTime, endTime);
  const durationValid =
    durationMinutes >= MIN_DURATION_MINUTES && durationMinutes <= MAX_DURATION_MINUTES;

  /** Moving the start drags the end with it, keeping the block the same length. */
  const handleStartChange = (value: string) => {
    setEndTime(addMinutesToTime(value, durationMinutes));
    setStartTime(value);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed || !durationValid) return;

    const startsAt = combineDateAndTime(day, startTime);
    // The end is placed relative to the start rather than parsed on `day`, so a
    // block running past midnight lands on the following day instead of
    // becoming a negative interval the server would reject.
    const endsAt = new Date(startsAt.getTime() + durationMinutes * 60_000);

    const payload = {
      goal: trimmed,
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      timezone: browserTimeZone(),
      reminder_offset_minutes: reminder,
    };

    const done = {
      onSuccess: () => {
        notify({
          variant: 'success',
          title: editing ? 'Block updated' : 'Block planned',
          message: `${trimmed} · ${formatDuration(durationMinutes)}`,
        });
        onClose();
      },
    };

    if (session) update.mutate({ id: session.id, payload }, done);
    else create.mutate({ ...payload, studyspace: studyspaceId }, done);
  };

  const handleStart = () => {
    if (!session) return;
    start.mutate(
      {
        id: session.id,
        payload: {
          focus_minutes: DEFAULT_RHYTHM.focusMinutes,
          rest_minutes: DEFAULT_RHYTHM.restMinutes,
        },
      },
      {
        onSuccess: () => {
          notify({
            variant: 'success',
            title: 'Session started',
            message: 'The timer is open on the studyspace.',
          });
          onClose();
        },
      },
    );
  };

  // Only a block still planned can be edited; the rest is a record.
  const editable = !session || session.status === 'planned';

  return (
    <div
      ref={container}
      role="dialog"
      aria-label={editing ? 'Edit planned block' : 'Plan a study block'}
      className={cn(
        'absolute z-40 w-72 rounded-xs border border-rule bg-page p-4 shadow-lg',
        alignRight ? 'right-0' : 'left-0',
        alignTop ? 'bottom-full mb-1' : 'top-full mt-1',
      )}
    >
      <header className="mb-3 flex items-baseline justify-between gap-2">
        <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          {day.toLocaleDateString(undefined, {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          })}
        </p>
        {session && session.status !== 'planned' && (
          <span className="font-heading text-[0.65rem] uppercase tracking-[0.12em] text-muted">
            {STATUS_LABELS[session.status]}
          </span>
        )}
      </header>

      {failure && (
        <div className="mb-3">
          <ErrorState title="Could not save the block" message={getApiErrorMessage(failure)} />
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-3">
        <Input
          label="Goal"
          name="goal"
          autoFocus
          required
          disabled={!editable}
          value={goal}
          onChange={(event) => setGoal(event.target.value)}
          error={fieldErrors.goal}
        />

        <div className="grid grid-cols-2 gap-3">
          <Input
            label="From"
            name="starts_at"
            type="time"
            required
            disabled={!editable}
            value={startTime}
            onChange={(event) => handleStartChange(event.target.value)}
            error={fieldErrors.starts_at}
          />
          <Input
            label="To"
            name="ends_at"
            type="time"
            required
            disabled={!editable}
            value={endTime}
            onChange={(event) => setEndTime(event.target.value)}
            error={fieldErrors.ends_at}
          />
        </div>

        <p
          className={cn(
            'font-heading text-xs uppercase tracking-[0.12em]',
            durationValid ? 'text-muted' : 'text-danger',
          )}
        >
          {durationValid
            ? formatDuration(durationMinutes)
            : `Between ${MIN_DURATION_MINUTES}m and ${formatDuration(MAX_DURATION_MINUTES)}`}
        </p>

        <Select
          label="Reminder"
          name="reminder_offset_minutes"
          disabled={!editable}
          value={reminder === null ? 'none' : String(reminder)}
          onChange={(event) =>
            setReminder(event.target.value === 'none' ? null : Number(event.target.value))
          }
          error={fieldErrors.reminder_offset_minutes}
        >
          {REMINDER_CHOICES.map((choice) => (
            <option
              key={choice.label}
              value={choice.minutes === null ? 'none' : String(choice.minutes)}
            >
              {choice.label}
            </option>
          ))}
        </Select>

        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {session && editable && (
            <>
              <Button
                type="button"
                variant="quiet"
                size="sm"
                onClick={() => cancel.mutate(session.id, { onSuccess: onClose })}
              >
                Cancel block
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={handleStart}>
                Start now
              </Button>
            </>
          )}

          {session && !editable && (
            <Button
              type="button"
              variant="danger"
              size="sm"
              onClick={() => remove.mutate(session.id, { onSuccess: onClose })}
            >
              Delete
            </Button>
          )}

          {editable && (
            <Button type="submit" size="sm" loading={pending} disabled={!trimmed || !durationValid}>
              {editing ? 'Save' : 'Plan block'}
            </Button>
          )}
        </div>
      </form>
    </div>
  );
};
