import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Button,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import { formatDate } from '../../../lib/formatDate';
import { GraphSectionMount } from '../../graph/components/GraphSectionMount';
import { AddNoteForm } from '../../notes/components/AddNoteForm';
import { NoteRow } from '../../notes/components/NoteRow';
import { AddSourceForm } from '../../sources/components/AddSourceForm';
import { SourceRow } from '../../sources/components/SourceRow';
import { DetailRow, DetailSection } from '../components/DetailSection';
import { useStudyspace } from '../hooks/useStudyspace';
import { REFERENCE_TYPE_LABEL } from '../labels';

const BackLink = () => (
  <Link
    to="/studyspaces"
    className="font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink"
  >
    &larr; All studyspaces
  </Link>
);

export const StudyspaceDetailPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);
  // Declared above the early returns: hooks cannot run conditionally.
  const [addingSource, setAddingSource] = useState(false);
  const [addingNote, setAddingNote] = useState(false);
  const { data: studyspace, isPending, isError, error, refetch } = useStudyspace(id);

  if (isPending) {
    return (
      <div className="flex flex-col gap-6">
        <Skeleton className="h-10 w-2/3" />
        <SkeletonText lines={3} />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  if (isError) {
    // A 404 here means "not yours or gone" — get_queryset filters by user.
    return (
      <div className="flex flex-col gap-6">
        <BackLink />
        {getApiErrorStatus(error) === 404 ? (
          <EmptyState
            title="Studyspace not found"
            description="It may have been deleted, or it belongs to another account."
          />
        ) : (
          <ErrorState
            title="Could not load this studyspace"
            message={getApiErrorMessage(error)}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  return (
    <article className="flex flex-col gap-8">
      <header className="flex flex-col gap-4">
        <BackLink />

        <div>
          <h1 className="font-display text-4xl text-ink">{studyspace.title}</h1>
          <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
            Created <time dateTime={studyspace.created_at}>{formatDate(studyspace.created_at)}</time>
            {' · '}
            Updated <time dateTime={studyspace.updated_at}>{formatDate(studyspace.updated_at)}</time>
          </p>
        </div>

        {studyspace.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {studyspace.tags.map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="max-w-measure text-ink">{studyspace.description}</p>

        <Divider ornament className="max-w-40" />
      </header>

      <div className="grid gap-8 lg:grid-cols-2">
        <DetailSection
          title="Sources"
          count={studyspace.sources.length}
          emptyMessage="No sources uploaded yet."
          action={
            <Button variant="quiet" size="sm" onClick={() => setAddingSource((open) => !open)}>
              {addingSource ? 'Close' : 'Add source'}
            </Button>
          }
          banner={
            addingSource && (
              <AddSourceForm studyspaceId={id} onDone={() => setAddingSource(false)} />
            )
          }
        >
          <ul>
            {studyspace.sources.map((source) => (
              <SourceRow key={source.id} source={source} studyspaceId={id} />
            ))}
          </ul>
        </DetailSection>

        <DetailSection
          title="Notes"
          count={studyspace.notes.length}
          emptyMessage="No notes written yet."
          action={
            <Button variant="quiet" size="sm" onClick={() => setAddingNote((open) => !open)}>
              {addingNote ? 'Close' : 'Add note'}
            </Button>
          }
          banner={
            addingNote && <AddNoteForm studyspaceId={id} onDone={() => setAddingNote(false)} />
          }
        >
          <ul>
            {studyspace.notes.map((note) => (
              <NoteRow key={note.id} note={note} />
            ))}
          </ul>
        </DetailSection>

        <DetailSection
          title="References"
          count={studyspace.references.length}
          emptyMessage="No references saved yet."
        >
          <ul>
            {studyspace.references.map((reference) => (
              <DetailRow key={reference.id}>
                <span className="flex min-w-0 flex-col">
                  <a
                    href={reference.url}
                    target="_blank"
                    rel="noreferrer"
                    className="truncate text-primary-ink underline underline-offset-4"
                  >
                    {reference.title}
                  </a>
                  {reference.authors && (
                    <span className="truncate text-sm text-muted">{reference.authors}</span>
                  )}
                </span>
                <Badge>
                  {REFERENCE_TYPE_LABEL[reference.reference_type] ?? reference.reference_type}
                </Badge>
              </DetailRow>
            ))}
          </ul>
        </DetailSection>
      </div>

      {/*
        Outside the two-column grid on purpose: notes, sources and references are
        peer lists, and the map is a way of looking at all of them at once. Half
        the width would also make it unreadable.
      */}
      <section className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between gap-3 border-b border-rule pb-2">
          <h2 className="font-heading text-sm uppercase tracking-[0.18em] text-ink">Map</h2>
        </div>

        <GraphSectionMount studyspaceId={id} />
      </section>
    </article>
  );
};
