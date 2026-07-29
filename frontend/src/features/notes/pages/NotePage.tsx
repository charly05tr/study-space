import { Link, useParams } from 'react-router-dom';
import { Divider, EmptyState, ErrorState, Skeleton, SkeletonText } from '../../../components/ui';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import { BlockEditor } from '../components/BlockEditor';
import { useNote } from '../hooks/useNote';

export const NotePage = () => {
  const { noteId } = useParams();
  const id = Number(noteId);
  const { data: note, isPending, isError, error, refetch } = useNote(id);

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-2/3" />
        <SkeletonText lines={6} />
      </div>
    );
  }

  if (isError) {
    // A 404 here means "not yours or gone" — get_queryset filters by owner
    // through studyspace__user.
    return (
      <div className="flex flex-col gap-6">
        {getApiErrorStatus(error) === 404 ? (
          <EmptyState
            title="Note not found"
            description="It may have been deleted, or it belongs to another account."
          />
        ) : (
          <ErrorState
            title="Could not load this note"
            message={getApiErrorMessage(error)}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  return (
    // One container for the whole note, so the title, the rule and the prose
    // share a single left and right edge instead of each computing its own.
    <article className="mx-auto flex w-full max-w-measure flex-col gap-2">
      <header className="flex flex-col gap-4">
        <Link
          to={`/studyspace/${note.studyspace}`}
          className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
        >
          &larr; Back to studyspace
        </Link>

        <h1 className="font-display text-4xl text-ink">{note.title}</h1>

        <Divider ornament className="max-w-40" />
      </header>

      {/*
        `key` on the note id, not just the prop: BlockEditor seeds Tiptap from
        `initialContent` once. Without a remount, navigating between two notes
        would keep the first document on screen.
      */}
      <BlockEditor
        key={note.id}
        noteId={note.id}
        studyspaceId={note.studyspace}
        initialContent={note.content}
      />
    </article>
  );
};
