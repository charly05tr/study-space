import { Link, useParams } from 'react-router-dom';
import {
  Badge,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import { formatDate } from '../../../lib/formatDate';
import { DetailRow, DetailSection } from '../components/DetailSection';
import { useStudyspace } from '../hooks/useStudyspace';
import { REFERENCE_TYPE_LABEL, SOURCE_TYPE_LABEL } from '../labels';

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
        >
          <ul>
            {studyspace.sources.map((source) => (
              <DetailRow key={source.id}>
                <span className="min-w-0 truncate text-ink">{source.title}</span>
                <Badge>{SOURCE_TYPE_LABEL[source.source_type] ?? source.source_type}</Badge>
              </DetailRow>
            ))}
          </ul>
        </DetailSection>

        <DetailSection
          title="Notes"
          count={studyspace.notes.length}
          emptyMessage="No notes written yet."
        >
          <ul>
            {studyspace.notes.map((note) => (
              <DetailRow key={note.id}>
                <span className="min-w-0 truncate text-ink">{note.title}</span>
              </DetailRow>
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
    </article>
  );
};
