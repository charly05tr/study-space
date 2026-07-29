import { useMatch } from 'react-router-dom';
import { useNote } from '../../notes/hooks/useNote';
import { useStudyspace } from './useStudyspace';

/**
 * The studyspace the current route belongs to, whether or not the URL says so.
 *
 * `/studyspace/:id` carries it. `/note/:id` does not — a note only knows its
 * studyspace once it has been fetched. That extra read costs nothing: NotePage
 * runs the same query, so react-query serves both from one request.
 *
 * Resolving this here rather than nesting the routes under
 * `/studyspace/:id/note/:id` keeps note URLs short and stable; the trade is
 * that the sidebar reads the route instead of being handed the id.
 */
export const useActiveStudyspaceId = (): number | null => {
  // `end: false` so a future /studyspace/:id/anything still matches.
  const fromRoute = useMatch({ path: '/studyspace/:studyspaceId', end: false });
  const inNote = useMatch({ path: '/note/:noteId', end: false });

  const routeId = Number(fromRoute?.params.studyspaceId);
  // NaN when there is no note in the route, which leaves the query disabled.
  const note = useNote(Number(inNote?.params.noteId));

  if (Number.isFinite(routeId)) return routeId;
  return note.data?.studyspace ?? null;
};

/** The active studyspace with its notes and sources, or nothing outside one. */
export const useActiveStudyspace = () => {
  const id = useActiveStudyspaceId();
  const query = useStudyspace(id ?? Number.NaN);

  return { id, ...query };
};
