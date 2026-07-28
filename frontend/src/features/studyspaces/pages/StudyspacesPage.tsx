import { useNavigate } from 'react-router-dom';
import {
  Button,
  Card,
  CardBody,
  Divider,
  EmptyState,
  ErrorState,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { StudyspaceCard } from '../components/StudyspaceCard';
import { useStudyspaces } from '../hooks/useStudyspaces';

const GRID = 'grid gap-4 sm:grid-cols-2 lg:grid-cols-3';

const LoadingGrid = () => (
  <div className={GRID}>
    {Array.from({ length: 6 }, (_, index) => (
      <Card key={index}>
        <CardBody className="flex flex-col gap-3">
          <Skeleton className="h-7 w-3/4" />
          <SkeletonText lines={2} />
        </CardBody>
      </Card>
    ))}
  </div>
);

export const StudyspacesPage = () => {
  const navigate = useNavigate();
  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useStudyspaces();

  const studyspaces = data?.pages.flatMap((page) => page.results) ?? [];
  const total = data?.pages[0]?.count ?? 0;

  return (
    <div className="flex flex-col gap-6">
      <header>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-display text-4xl text-ink">Your studyspaces</h1>
            <p className="mt-1 text-sm text-muted">
              {total === 1 ? '1 studyspace' : `${total} studyspaces`}
            </p>
          </div>
          <Button onClick={() => navigate('/studyspaces/create')}>New studyspace</Button>
        </div>
        <Divider className="mt-4" />
      </header>

      {isPending && <LoadingGrid />}

      {isError && (
        <ErrorState
          title="Could not load your studyspaces"
          message={getApiErrorMessage(error)}
          onRetry={() => refetch()}
        />
      )}

      {!isPending && !isError && studyspaces.length === 0 && (
        <EmptyState
          title="Nothing here yet"
          description="A studyspace holds your sources, notes and references for one subject."
          action={
            <Button onClick={() => navigate('/studyspaces/create')}>
              Create your first studyspace
            </Button>
          }
        />
      )}

      {studyspaces.length > 0 && (
        <>
          <ul className={GRID}>
            {studyspaces.map((studyspace) => (
              <li key={studyspace.id}>
                <StudyspaceCard studyspace={studyspace} />
              </li>
            ))}
          </ul>

          {hasNextPage && (
            <div className="flex justify-center">
              <Button
                variant="secondary"
                onClick={() => fetchNextPage()}
                loading={isFetchingNextPage}
              >
                Load more
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
};
