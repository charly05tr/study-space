import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  Button,
  Divider,
  EmptyState,
  ErrorState,
  FieldError,
  Input,
  Select,
  Skeleton,
  SkeletonText,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { useStudyspace } from '../../studyspaces/hooks/useStudyspace';
import { FlashcardForm } from '../components/FlashcardForm';
import { FlashcardItem } from '../components/FlashcardItem';
import { filterFlashcards } from '../flashcardList';
import type { StateFilter } from '../flashcardList';
import {
  useCreateFlashcard,
  useDeleteFlashcard,
  useFlashcardStats,
  useResetFlashcard,
  useStudyspaceFlashcards,
  useUpdateFlashcard,
} from '../hooks/useFlashcards';
import { STATE_LABELS } from '../types';
import type { FlashcardState } from '../types';

const backLinkClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted hover:text-ink';

/** Which card the form is open for: an existing id, a new one, or none. */
type Editing = number | 'new' | null;

const STATES: readonly FlashcardState[] = [0, 1, 2, 3];

/** Every flashcard in one studyspace: browse, create by hand, edit, reset and delete. */
export const FlashcardsPage = () => {
  const { studyspaceId } = useParams();
  const id = Number(studyspaceId);

  const [editing, setEditing] = useState<Editing>(null);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  // Fixed per visit: labels like "Due now" should not flicker while the list refetches.
  const [now] = useState(() => new Date());

  const studyspace = useStudyspace(id);
  const flashcards = useStudyspaceFlashcards(id);
  const stats = useFlashcardStats(id);
  const create = useCreateFlashcard();
  const update = useUpdateFlashcard();
  const reset = useResetFlashcard();
  const remove = useDeleteFlashcard();

  if (!Number.isFinite(id)) {
    return (
      <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
        <Link to="/studyspaces" className={backLinkClasses}>
          &larr; All studyspaces
        </Link>
        <EmptyState
          title="Studyspace not found"
          description="The link may be wrong, or the studyspace may have been deleted."
        />
      </article>
    );
  }

  const all = flashcards.data ?? [];
  const visible = filterFlashcards(all, search, stateFilter);
  const close = () => setEditing(null);
  const busy = update.isPending || reset.isPending || remove.isPending;
  const filtering = search.trim() !== '' || stateFilter !== 'all';

  return (
    <article className="mx-auto flex w-full max-w-measure flex-col gap-6">
      <header className="flex flex-col gap-4">
        <Link to={`/studyspace/${id}`} className={backLinkClasses}>
          &larr; Back to studyspace
        </Link>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-4xl text-ink">Flashcards</h1>
            {studyspace.data && (
              <p className="mt-2 font-heading text-xs uppercase tracking-[0.14em] text-muted">
                {studyspace.data.title}
                {stats.data &&
                  ` · ${stats.data.new} new · ${stats.data.due} due · ${stats.data.total} in total`}
              </p>
            )}
          </div>

          <div className="flex gap-2">
          <Link
            to={`/studyspace/${id}/flashcards/review`}
            className="inline-flex items-center justify-center rounded-xs border border-primary bg-primary px-3 py-1.5 font-heading text-xs uppercase tracking-[0.14em] text-on-primary transition-colors duration-150 hover:border-primary-400 hover:bg-primary-400"
          >
            Review
          </Link>
          <Button
            variant="secondary"
            size="sm"
            disabled={editing === 'new'}
            onClick={() => {
              create.reset();
              setEditing('new');
            }}
          >
            New flashcard
          </Button>
          </div>
        </div>

        <Divider ornament className="max-w-40" />
      </header>

      {editing === 'new' && (
        <FlashcardForm
          initial={{ front: '', back: '' }}
          submitLabel="Add flashcard"
          saving={create.isPending}
          error={create.isError ? getApiErrorMessage(create.error) : undefined}
          onCancel={close}
          onSubmit={(content) => create.mutate({ ...content, studyspace: id }, { onSuccess: close })}
        />
      )}

      {flashcards.isPending && (
        <div className="flex flex-col gap-4" role="status" aria-label="Loading flashcards">
          <Skeleton className="h-6 w-1/3" />
          <SkeletonText lines={6} />
        </div>
      )}

      {flashcards.isError && (
        <ErrorState
          title="Could not load the flashcards"
          message={getApiErrorMessage(flashcards.error)}
          onRetry={() => flashcards.refetch()}
        />
      )}

      {flashcards.isSuccess &&
        (all.length === 0 ? (
          editing !== 'new' && (
            <EmptyState
              title="No flashcards yet"
              description="Write one by hand with New flashcard, or convert the questions of a published quiz."
            />
          )
        ) : (
          <section aria-label="Flashcard list" className="flex flex-col gap-2">
            <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
              <Input
                label="Search"
                type="search"
                value={search}
                placeholder="Search front or back"
                onChange={(event) => setSearch(event.target.value)}
              />
              <Select
                label="State"
                value={String(stateFilter)}
                onChange={(event) =>
                  setStateFilter(
                    event.target.value === 'all'
                      ? 'all'
                      : (Number(event.target.value) as FlashcardState),
                  )
                }
              >
                <option value="all">All states</option>
                {STATES.map((state) => (
                  <option key={state} value={state}>
                    {STATE_LABELS[state]}
                  </option>
                ))}
              </Select>
            </div>

            <p role="status" className="text-sm text-muted">
              {filtering ? `${visible.length} of ${all.length} shown` : `${all.length} in total`}
            </p>

            {visible.length === 0 ? (
              <EmptyState
                title="No matches"
                description="Try another search, or clear the state filter."
              />
            ) : (
              <ul>
                {visible.map((card) =>
                  editing === card.id ? (
                    <li key={card.id} className="border-b border-rule py-4">
                      <FlashcardForm
                        initial={{ front: card.front, back: card.back }}
                        submitLabel="Save flashcard"
                        saving={update.isPending}
                        note="Editing the text keeps your progress on this card."
                        error={update.isError ? getApiErrorMessage(update.error) : undefined}
                        onCancel={close}
                        onSubmit={(content) =>
                          update.mutate({ flashcardId: card.id, payload: content }, { onSuccess: close })
                        }
                      />
                    </li>
                  ) : (
                    <FlashcardItem
                      key={card.id}
                      card={card}
                      now={now}
                      busy={busy}
                      resetting={reset.isPending && reset.variables === card.id}
                      deleting={remove.isPending && remove.variables === card.id}
                      onEdit={() => {
                        update.reset();
                        setEditing(card.id);
                      }}
                      onReset={() => reset.mutate(card.id)}
                      onDelete={() => {
                        if (editing === card.id) close();
                        remove.mutate(card.id);
                      }}
                    />
                  ),
                )}
              </ul>
            )}
          </section>
        ))}

      {(reset.isError || remove.isError) && (
        <FieldError message={getApiErrorMessage(reset.isError ? reset.error : remove.error)} />
      )}
    </article>
  );
};
