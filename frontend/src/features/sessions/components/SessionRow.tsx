import { Badge } from '../../../components/ui';
import { formatDate } from '../../../lib/formatDate';
import { formatSpan } from '../pomodoro';
import type { StudySession } from '../types';

interface SessionRowProps {
  session: StudySession;
}

/**
 * One entry of the history.
 *
 * The count comes first among the details because it is the only number that
 * says anything about the work: how long the session was open counts the
 * interruptions too, and the rhythm was a setting, not a result.
 */
export const SessionRow = ({ session }: SessionRowProps) => {
  const span = formatSpan(session.created_at, session.finished_at);
  const pomodoros = session.completed_pomodoros;

  return (
    <li className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-rule/60 py-3 last:border-b-0">
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-ink">{session.goal}</span>
        <span className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          <time dateTime={session.created_at}>{formatDate(session.created_at)}</time>
          {span && ` · ${span}`}
          {` · ${session.focus_minutes}/${session.rest_minutes} min`}
        </span>
      </span>

      <span className="flex shrink-0 items-center gap-2">
        {session.is_active && <Badge variant="success">Running</Badge>}
        <Badge variant={pomodoros > 0 ? 'primary' : 'neutral'}>
          {pomodoros} {pomodoros === 1 ? 'pomodoro' : 'pomodoros'}
        </Badge>
      </span>
    </li>
  );
};
