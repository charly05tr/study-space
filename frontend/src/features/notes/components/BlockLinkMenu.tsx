import { forwardRef, useContext, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { cn } from '../../../components/ui/cn';
import { useBlockSearch } from '../../blocks/hooks/useBlockSearch';
import { RELATION_KINDS, type BlockSummary, type RelationKind } from '../../blocks/types';
import { NoteEditorContext } from '../noteEditorContext';

export interface BlockLinkSelection {
  block: BlockSummary;
  kind: RelationKind;
}

export interface BlockLinkMenuHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

export interface BlockLinkMenuProps {
  query: string;
  command: (selection: BlockLinkSelection) => void;
}

const Row = ({
  active,
  onHover,
  onPick,
  title,
  hint,
}: {
  active: boolean;
  onHover: () => void;
  onPick: () => void;
  title: string;
  hint: string;
}) => (
  <button
    type="button"
    role="option"
    aria-selected={active}
    onMouseEnter={onHover}
    // mousedown, not click: click fires after the editor has lost the selection
    // the command needs.
    onMouseDown={(event) => {
      event.preventDefault();
      onPick();
    }}
    className={cn(
      'flex w-full items-baseline justify-between gap-3 border-l-2 px-3 py-1.5 text-left transition-colors',
      active ? 'border-primary bg-tint text-ink' : 'border-transparent text-muted hover:text-ink',
    )}
  >
    <span className="min-w-0 truncate text-sm">{title}</span>
    <span className="shrink-0 font-heading text-[0.65rem] uppercase tracking-[0.14em] text-muted">
      {hint}
    </span>
  </button>
);

/**
 * Two steps in one popup: pick the block, then say how it relates.
 *
 * The second step is not an afterthought. A link that only records "these are
 * connected" throws away the thought that made you write it, and the moment you
 * still hold that thought is right now — not later, in a properties panel you
 * will never open. It costs one extra Enter.
 *
 * Both steps live inside this component rather than in the suggestion plugin,
 * because the plugin owns the query and the range, and it must keep owning them
 * while the kind is chosen: only then can `deleteRange` still remove the `[[`
 * text the user typed.
 */
export const BlockLinkMenu = forwardRef<BlockLinkMenuHandle, BlockLinkMenuProps>(
  ({ query, command }, ref) => {
    const noteEditor = useContext(NoteEditorContext);
    const search = useBlockSearch(noteEditor?.studyspaceId ?? null, query);
    const blocks = search.data ?? [];

    const [picked, setPicked] = useState<BlockSummary | null>(null);
    const [selected, setSelected] = useState(0);
    const listRef = useRef<HTMLDivElement>(null);

    const options: { key: string; title: string; hint: string }[] = picked
      ? RELATION_KINDS.map((relation) => ({
          key: relation.kind,
          title: relation.label,
          hint: relation.hint,
        }))
      : blocks.map((block) => ({
          key: block.id,
          title: block.text || '(empty block)',
          hint: block.note_title,
        }));

    // Typing narrows the block list, so the old index can point past its end.
    // Reset on the results, not on the phase: entering the kind list should
    // start at the top too, and it does because `options` changes identity.
    const [lastOptions, setLastOptions] = useState(options);
    if (options !== lastOptions) {
      setLastOptions(options);
      setSelected(0);
    }

    useEffect(() => {
      listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
    }, [selected]);

    const pick = (index: number) => {
      if (picked) {
        command({ block: picked, kind: RELATION_KINDS[index].kind });
        return;
      }
      const block = blocks[index];
      if (block) setPicked(block);
    };

    useImperativeHandle(
      ref,
      () => ({
        onKeyDown: (event) => {
          // Backspace on an empty kind list walks back to the blocks instead of
          // dropping the whole mention — the usual reason to press it here is
          // "wrong block", not "cancel".
          if (event.key === 'Backspace' && picked) {
            setPicked(null);
            return true;
          }

          if (options.length === 0) return false;

          if (event.key === 'ArrowDown') {
            setSelected((current) => (current + 1) % options.length);
            return true;
          }
          if (event.key === 'ArrowUp') {
            setSelected((current) => (current + options.length - 1) % options.length);
            return true;
          }
          if (event.key === 'Enter') {
            pick(selected);
            return true;
          }

          // Escape stays with the suggestion plugin, which owns dismissal.
          return false;
        },
      }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [options, picked, selected, blocks, command],
    );

    if (!picked && search.isPending) {
      return (
        <div className="w-80 rounded-xs border border-rule bg-page px-3 py-2 shadow-sm">
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">Searching…</p>
        </div>
      );
    }

    if (options.length === 0) {
      return (
        <div className="w-80 rounded-xs border border-rule bg-page px-3 py-2 shadow-sm">
          <p className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
            No block matches
          </p>
        </div>
      );
    }

    return (
      <div
        ref={listRef}
        className="max-h-80 w-80 overflow-y-auto rounded-xs border border-rule bg-page py-1 shadow-sm"
      >
        <p className="flex items-baseline justify-between gap-2 px-3 pt-1 pb-1 font-heading text-[0.65rem] uppercase tracking-[0.16em] text-muted/70">
          <span>{picked ? 'How does it relate?' : 'Link to a block'}</span>
          {picked && <span className="max-w-40 truncate normal-case">{picked.note_title}</span>}
        </p>

        {picked && (
          <p className="truncate border-b border-rule px-3 pb-2 text-sm text-ink italic">
            {picked.text || '(empty block)'}
          </p>
        )}

        <div role="listbox" aria-label={picked ? 'Relation type' : 'Blocks'} className="pt-1">
          {options.map((option, index) => (
            <Row
              key={option.key}
              active={index === selected}
              onHover={() => setSelected(index)}
              onPick={() => pick(index)}
              title={option.title}
              hint={option.hint}
            />
          ))}
        </div>
      </div>
    );
  },
);

BlockLinkMenu.displayName = 'BlockLinkMenu';
