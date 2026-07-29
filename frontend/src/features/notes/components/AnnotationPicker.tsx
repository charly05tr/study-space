import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../../components/ui/cn';
import { fieldClasses } from '../../../components/ui';
import type { Annotation } from '../../annotations/types';
import { byRecency, matchAnnotations } from '../slashMenuItems';

interface AnnotationPickerProps {
  annotations: Annotation[];
  loading: boolean;
  /** Carried over from the `/` menu so the search is never retyped. */
  initialQuery: string;
  onSelect: (annotation: Annotation) => void;
  onClose: () => void;
}

/** `null` means "every source". */
type SourceFilter = number | null;

export const AnnotationPicker = ({
  annotations,
  loading,
  initialQuery,
  onSelect,
  onClose,
}: AnnotationPickerProps) => {
  const [query, setQuery] = useState(initialQuery);
  const [source, setSource] = useState<SourceFilter>(null);
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  /**
   * With several books in a studyspace, "which source" narrows the field faster
   * than any word does — it is the filter people reach for first.
   */
  const sources = useMemo(() => {
    const seen = new Map<number, string>();
    for (const annotation of annotations) seen.set(annotation.source, annotation.source_title);
    return [...seen].map(([id, title]) => ({ id, title }));
  }, [annotations]);

  const results = useMemo(() => {
    const scoped = source === null
      ? annotations
      : annotations.filter((annotation) => annotation.source === source);

    // Same matcher as the inline menu: a query that found something there must
    // not come up empty here.
    return [...matchAnnotations(query, scoped)].sort(byRecency);
  }, [annotations, query, source]);

  // Adjusted during render rather than in an effect: an effect would paint one
  // frame with the highlight sitting on a row the new results no longer have.
  const [lastResults, setLastResults] = useState(results);
  if (results !== lastResults) {
    setLastResults(results);
    setSelected(0);
  }

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  const handleKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    if (results.length === 0) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setSelected((current) => (current + 1) % results.length);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setSelected((current) => (current + results.length - 1) % results.length);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      onSelect(results[selected]);
    }
  };

  return (
    <div
      // Fixed overlay rather than a portal: the editor is the only thing this
      // can ever cover, and it already spans the page.
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/20 p-4 pt-[10vh] backdrop-blur-[2px]"
      onMouseDown={(event) => {
        // Only a click on the backdrop itself closes; one that started inside
        // the dialog and drifted out must not.
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Insert an annotation"
        onKeyDown={handleKeyDown}
        className="flex max-h-[70vh] w-full max-w-xl flex-col rounded-xs border border-rule bg-page shadow-lg"
      >
        <div className="flex flex-col gap-3 border-b border-rule p-4">
          <input
            autoFocus
            type="search"
            value={query}
            placeholder="Search your annotations"
            aria-label="Search your annotations"
            onChange={(event) => setQuery(event.target.value)}
            className={fieldClasses}
          />

          {sources.length > 1 && (
            <div className="flex flex-wrap gap-1">
              <FilterChip active={source === null} onClick={() => setSource(null)}>
                All sources
              </FilterChip>
              {sources.map((entry) => (
                <FilterChip
                  key={entry.id}
                  active={source === entry.id}
                  onClick={() => setSource(entry.id)}
                >
                  {entry.title}
                </FilterChip>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <p className="p-6 text-sm text-muted">Loading annotations…</p>
        ) : results.length === 0 ? (
          <p className="p-6 text-sm text-muted">
            {annotations.length === 0
              ? 'Nothing highlighted in this studyspace yet.'
              : 'No annotation matches that search.'}
          </p>
        ) : (
          <ul ref={listRef} role="listbox" className="scrollbar-slim flex-1 overflow-y-auto p-2">
            {results.map((annotation, index) => (
              <li key={annotation.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={index === selected}
                  onMouseEnter={() => setSelected(index)}
                  onMouseDown={(event) => {
                    event.preventDefault();
                    onSelect(annotation);
                  }}
                  className={cn(
                    'flex w-full flex-col gap-1 border-l-2 px-3 py-2 text-left transition-colors',
                    index === selected
                      ? 'border-primary bg-tint'
                      : 'border-transparent hover:bg-tint/40',
                  )}
                >
                  {/* The full quote, not an excerpt: this is the surface for
                      when you are not sure which one you want. */}
                  <span className="font-body text-sm text-ink italic">{annotation.content}</span>
                  <span className="flex flex-wrap items-baseline gap-x-2 font-heading text-[0.65rem] uppercase tracking-[0.14em] text-muted">
                    <span className="truncate">{annotation.source_title}</span>
                    <span aria-hidden>·</span>
                    <span>p. {annotation.page}</span>
                    {annotation.annotation_type === 'note' && (
                      <>
                        <span aria-hidden>·</span>
                        <span>Note</span>
                      </>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}

        <p className="flex items-baseline justify-between gap-3 border-t border-rule px-4 py-2 font-heading text-[0.65rem] uppercase tracking-[0.14em] text-muted">
          <span>
            {results.length} of {annotations.length}
          </span>
          <span>&uarr;&darr; to move · Enter to insert · Esc to close</span>
        </p>
      </div>
    </div>
  );
};

const FilterChip = ({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) => (
  <button
    type="button"
    aria-pressed={active}
    onClick={onClick}
    className={cn(
      'max-w-48 truncate rounded-xs border px-2 py-0.5 font-heading text-[0.65rem] uppercase tracking-[0.14em] transition-colors',
      active
        ? 'border-primary bg-primary/15 text-ink'
        : 'border-rule text-muted hover:border-ink hover:text-ink',
    )}
  >
    {children}
  </button>
);
