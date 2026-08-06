import { Badge, Button, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useFinishSession } from '../hooks/useStudySessions';
import { usePomodoroRunner } from '../hooks/usePomodoroRunner';
import { usePomodoroStore } from '../store/pomodoroStore';
import type { StudySession } from '../types';
import { PomodoroDial } from './PomodoroDial';

interface PomodoroPanelProps {
  session: StudySession;
  studyspaceId: number;
}

/**
 * The timer at full size, on the studyspace's own page.
 *
 * The tick and the end-of-phase handover live in `usePomodoroRunner`, shared
 * with the reader's peeking widget. This component only draws and commands.
 */
export const PomodoroPanel = ({ session, studyspaceId }: PomodoroPanelProps) => {
  const { notify } = useNotification();
  const finishSession = useFinishSession(studyspaceId);
  const detach = usePomodoroStore((state) => state.detach);

  const runner = usePomodoroRunner(session, studyspaceId);

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

  if (!runner) return null;

  return (
    <div className="flex flex-col items-center gap-6 rounded-xs border border-rule px-4 py-8 sm:flex-row sm:items-center sm:gap-10 sm:px-8">
      <PomodoroDial
        phase={runner.timer.phase}
        progress={runner.progress}
        clock={runner.clock}
        running={runner.running}
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
          <Button size="sm" onClick={runner.running ? runner.pause : runner.resume}>
            {runner.running ? 'Pause' : 'Resume'}
          </Button>
          <Button variant="quiet" size="sm" onClick={runner.restart}>
            Restart phase
          </Button>
          {/* Skipping does NOT count the pomodoro: the record is what you sat
              through, not what you scheduled. */}
          <Button variant="quiet" size="sm" onClick={runner.next}>
            Skip to {runner.timer.phase === 'focus' ? 'rest' : 'focus'}
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-pressed={runner.soundOn}
            onClick={runner.toggleSound}
          >
            {runner.soundOn ? 'Sound on' : 'Sound off'}
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
