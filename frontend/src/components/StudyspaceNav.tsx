import { NavLink } from 'react-router-dom';
import { cn } from './ui/cn';
import { SkeletonText } from './ui';
import { useActiveStudyspace } from '../features/studyspaces/hooks/useActiveStudyspace';

const itemClasses = ({ isActive }: { isActive: boolean }) =>
  cn(
    'block truncate border-l-2 py-1 pl-3 text-sm transition-colors',
    isActive ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink',
  );

const Section = ({ title, count, children }: {
  title: string;
  count: number;
  children: React.ReactNode;
}) => (
  <div className="flex flex-col gap-1">
    <p className="flex items-baseline justify-between gap-2 pl-3 font-heading text-[0.65rem] uppercase tracking-[0.16em] text-muted/70">
      <span>{title}</span>
      <span>{count}</span>
    </p>
    {children}
  </div>
);

/**
 * The contents of the studyspace you are currently inside.
 *
 * Renders nothing anywhere else: a sidebar listing another studyspace's notes
 * would be worse than an empty one.
 */
export const StudyspaceNav = () => {
  const { id, data: studyspace, isPending } = useActiveStudyspace();

  if (id === null) return null;

  if (isPending) {
    return (
      <div className="flex flex-col gap-2 border-t border-rule pt-4 pl-3">
        <SkeletonText lines={4} />
      </div>
    );
  }

  if (!studyspace) return null;

  return (
    <div className="flex flex-col gap-5 border-t border-rule pt-4">
      <NavLink
        to={`/studyspace/${studyspace.id}`}
        end
        className={({ isActive }) =>
          cn(
            'block truncate border-l-2 py-1 pl-3 font-heading text-sm transition-colors',
            isActive ? 'border-primary text-ink' : 'border-transparent text-ink/80 hover:text-ink',
          )
        }
      >
        {studyspace.title}
      </NavLink>

      {/* Above the lists on purpose: the map is a way of looking at all of them
          at once, not a third kind of thing sitting alongside. */}
      <NavLink
        to={`/studyspace/${studyspace.id}/graph`}
        className={({ isActive }) =>
          cn(
            'block border-l-2 py-1 pl-3 font-heading text-xs uppercase tracking-[0.14em] transition-colors',
            isActive ? 'border-primary text-ink' : 'border-transparent text-muted hover:text-ink',
          )
        }
      >
        Map
      </NavLink>

      <Section title="Notes" count={studyspace.notes.length}>
        {studyspace.notes.length === 0 ? (
          <p className="pl-3 text-sm text-muted/70">None yet</p>
        ) : (
          <ul>
            {studyspace.notes.map((note) => (
              <li key={note.id}>
                <NavLink to={`/note/${note.id}`} className={itemClasses}>
                  {note.title}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Sources" count={studyspace.sources.length}>
        {studyspace.sources.length === 0 ? (
          <p className="pl-3 text-sm text-muted/70">None yet</p>
        ) : (
          <ul>
            {studyspace.sources.map((source) => (
              <li key={source.id}>
                {source.is_converted ? (
                  <NavLink to={`/source/${source.id}`} className={itemClasses}>
                    {source.title}
                  </NavLink>
                ) : (
                  /*
                    Not a link on purpose: opening an unconverted source starts a
                    full conversion inside the reader with no progress feedback.
                    The detail page is where that is a deliberate, visible action.
                  */
                  <span
                    title="Convert this source before reading it"
                    className="block truncate border-l-2 border-transparent py-1 pl-3 text-sm text-muted/60"
                  >
                    {source.title}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
};
