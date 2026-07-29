import {
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import { cn } from '../../../components/ui/cn';
import { useStudyspaceAnnotations } from '../../annotations/hooks/useAnnotations';
import { NoteEditorContext } from '../noteEditorContext';
import {
  ANNOTATIONS_GROUP,
  ANNOTATION_SEARCH_KEY,
  createAnnotationSearchItem,
  filterAnnotationItems,
  type SlashItem,
} from '../slashMenuItems';

export interface SlashMenuHandle {
  /** Returns true when the key was consumed and must not reach the editor. */
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface SlashMenuProps {
  /** The static blocks, already filtered by the extension. */
  items: SlashItem[];
  /** What the user typed after the slash. */
  query: string;
  command: (item: SlashItem) => void;
}

export const SlashMenu = forwardRef<SlashMenuHandle, SlashMenuProps>(
  ({ items: blocks, query, command }, ref) => {
    const [selected, setSelected] = useState(0);
    const listRef = useRef<HTMLUListElement>(null);

    /**
     * The citations are loaded here, not handed down by the extension: this
     * component renders inside the app's React tree, so it can just use the
     * same hook any other component would, cache included.
     */
    const noteEditor = useContext(NoteEditorContext);
    const annotationsQuery = useStudyspaceAnnotations(noteEditor?.studyspaceId ?? Number.NaN);

    const { items, shown, total } = useMemo(() => {
      const annotations = annotationsQuery.data ?? [];
      const matched = filterAnnotationItems(query, annotations);

      return {
        items: [
          ...blocks,
          ...matched.items,
          // Offered whenever the studyspace has anything at all, so `/annotation`
          // finds it by name even when the text matches nothing.
          ...(annotations.length > 0
            ? [createAnnotationSearchItem(matched.total - matched.items.length)]
            : []),
        ],
        shown: matched.items.length,
        total: matched.total,
      };
    }, [blocks, query, annotationsQuery.data]);

    const openPicker = noteEditor?.openAnnotationPicker;

    const select = useCallback(
      (item: SlashItem) => {
        // Running the command first clears the typed `/query` in both cases; the
        // search row simply inserts nothing on its way out.
        command(item);
        if (item.key === ANNOTATION_SEARCH_KEY) openPicker?.(query);
      },
      [command, openPicker, query],
    );

    // Every keystroke narrows the list, so the previous index can point past the
    // end — or at a block the user is no longer looking at.
    useEffect(() => setSelected(0), [items]);

    // Keyboard navigation must not require the mouse to have moved: keep the
    // highlighted row in view when arrowing past the visible window.
    useEffect(() => {
      listRef.current
        ?.querySelector('[aria-selected="true"]')
        ?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) => {
          if (items.length === 0) return false;

          if (event.key === 'ArrowDown') {
            setSelected((current) => (current + 1) % items.length);
            return true;
          }

          if (event.key === 'ArrowUp') {
            // Wrap backwards without going negative.
            setSelected((current) => (current + items.length - 1) % items.length);
            return true;
          }

          if (event.key === 'Enter') {
            select(items[selected]);
            return true;
          }

          // Escape is deliberately not handled here: the suggestion plugin owns
          // dismissal, and consuming the key would leave its state stuck open.
          return false;
        },
      }),
      [items, selected, select],
    );

    if (items.length === 0) {
      return (
        <div className="w-72 rounded-xs border border-rule bg-page px-3 py-2 shadow-sm">
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            No blocks match
          </p>
        </div>
      );
    }

    return (
      <ul
        ref={listRef}
        role="listbox"
        aria-label="Insert block"
        className="max-h-72 w-72 overflow-y-auto rounded-xs border border-rule bg-page py-1 shadow-sm"
      >
        {items.map((item, index) => (
          <li key={item.key}>
            {/* A heading only where the group changes, so a menu with no
                citations never shows an empty section. */}
            {item.group !== items[index - 1]?.group && (
              <p className="flex items-baseline justify-between gap-2 px-3 pt-2 pb-1 font-heading text-[0.65rem] uppercase tracking-[0.16em] text-muted/70">
                <span>{item.group}</span>
                {/* Truncation has to be visible. Without this the cap looks
                    like "these are all the annotations there are". */}
                {item.group === ANNOTATIONS_GROUP && total > shown && (
                  <span>
                    {shown} of {total}
                  </span>
                )}
              </p>
            )}

            <button
              type="button"
              role="option"
              aria-selected={index === selected}
              // Pointer and keyboard drive the same highlight, so hovering then
              // pressing Enter inserts what the user is looking at.
              onMouseEnter={() => setSelected(index)}
              // mousedown, not click: click fires after the editor has already
              // lost the selection the command needs.
              onMouseDown={(event) => {
                event.preventDefault();
                select(item);
              }}
              className={cn(
                'flex w-full items-baseline justify-between gap-3 border-l-2 px-3 py-1.5 text-left transition-colors',
                index === selected
                  ? 'border-primary bg-tint text-ink'
                  : 'border-transparent text-muted hover:text-ink',
              )}
            >
              <span className="min-w-0 truncate font-heading text-sm">{item.title}</span>
              <span className="shrink-0 text-xs text-muted">{item.hint}</span>
            </button>
          </li>
        ))}
      </ul>
    );
  },
);

SlashMenu.displayName = 'SlashMenu';
