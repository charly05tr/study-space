import { useState } from 'react';
import type { FormEvent } from 'react';
import { Button, cn, ErrorState, Input, useNotification } from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { useStartSession } from '../hooks/useStudySessions';
import { usePomodoroStore } from '../store/pomodoroStore';
import { clampMinutes, DEFAULT_RHYTHM, MAX_MINUTES, MIN_MINUTES, RHYTHMS } from '../types';

interface StartSessionFormProps {
  studyspaceId: number;
  onDone: () => void;
}

export const StartSessionForm = ({ studyspaceId, onDone }: StartSessionFormProps) => {
  const { notify } = useNotification();
  const startSession = useStartSession(studyspaceId);
  const attach = usePomodoroStore((state) => state.attach);

  const [goal, setGoal] = useState('');
  const [focusMinutes, setFocusMinutes] = useState(DEFAULT_RHYTHM.focusMinutes);
  const [restMinutes, setRestMinutes] = useState(DEFAULT_RHYTHM.restMinutes);

  const fieldErrors = getFieldErrors(startSession.error);
  const trimmed = goal.trim();

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!trimmed) return;

    startSession.mutate(
      {
        goal: trimmed,
        studyspace: studyspaceId,
        // Clamped here as well as on the server: a number input accepts typed
        // text, and `min`/`max` alone do not stop a submit in every browser.
        focus_minutes: clampMinutes(focusMinutes),
        rest_minutes: clampMinutes(restMinutes),
      },
      {
        onSuccess: (session) => {
          // Started here rather than by the panel's mount effect, so the clock
          // begins at the click and not a render later.
          attach(session.id, 'focus');
          notify({
            variant: 'success',
            title: 'Session started',
            message: `${session.focus_minutes} minutes on "${session.goal}".`,
          });
          onDone();
        },
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-5 rounded-xs border border-rule p-4"
    >
      {startSession.isError && (
        <ErrorState
          title="Could not start the session"
          message={getApiErrorMessage(startSession.error)}
        />
      )}

      <Input
        label="Goal"
        name="goal"
        hint="What this stretch is for"
        autoFocus
        required
        value={goal}
        onChange={(event) => setGoal(event.target.value)}
        error={fieldErrors.goal}
      />

      <fieldset className="flex flex-col gap-2">
        <legend className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          Rhythm
        </legend>

        <div className="flex flex-wrap gap-2">
          {RHYTHMS.map((rhythm) => {
            const chosen =
              rhythm.focusMinutes === focusMinutes && rhythm.restMinutes === restMinutes;
            return (
              <button
                key={rhythm.label}
                type="button"
                aria-pressed={chosen}
                onClick={() => {
                  setFocusMinutes(rhythm.focusMinutes);
                  setRestMinutes(rhythm.restMinutes);
                }}
                className={cn(
                  'rounded-xs border px-3 py-1.5 font-heading text-xs uppercase tracking-[0.12em]',
                  'transition-colors duration-150',
                  chosen
                    ? 'border-primary bg-primary-50 text-primary-ink'
                    : 'border-rule text-muted hover:border-primary-200 hover:text-ink',
                )}
              >
                {rhythm.label}
                <span className="ml-2 tabular-nums opacity-70">
                  {rhythm.focusMinutes}/{rhythm.restMinutes}
                </span>
              </button>
            );
          })}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Focus (min)"
          name="focus_minutes"
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={focusMinutes}
          onChange={(event) => setFocusMinutes(Number(event.target.value))}
          error={fieldErrors.focus_minutes}
        />
        <Input
          label="Rest (min)"
          name="rest_minutes"
          type="number"
          inputMode="numeric"
          min={MIN_MINUTES}
          max={MAX_MINUTES}
          value={restMinutes}
          onChange={(event) => setRestMinutes(Number(event.target.value))}
          error={fieldErrors.rest_minutes}
        />
      </div>

      <div className="flex justify-end gap-2">
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" size="sm" loading={startSession.isPending} disabled={!trimmed}>
          Start session
        </Button>
      </div>
    </form>
  );
};
