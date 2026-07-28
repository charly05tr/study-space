import { useState } from 'react';
import { Button } from '../../../components/ui';
import type { SelectionInfo } from './ReaderFrame';

interface SelectionToolbarProps {
  selection: SelectionInfo;
  saving: boolean;
  onHighlight: () => void;
  onNote: (content: string) => void;
  onDismiss: () => void;
}

export const SelectionToolbar = ({
  selection,
  saving,
  onHighlight,
  onNote,
  onDismiss,
}: SelectionToolbarProps) => {
  // Reset on a new selection comes from the `key` the parent passes, which
  // remounts this component. An effect calling setState would cascade renders.
  const [noteOpen, setNoteOpen] = useState(false);
  const [content, setContent] = useState('');

  return (
    <div
      role="dialog"
      aria-label="Annotate selection"
      style={{
        top: Math.max(selection.top - 12, 8),
        left: selection.left,
      }}
      className="fixed z-40 -translate-x-1/2 -translate-y-full rounded-xs border border-rule bg-page p-1"
    >
      {noteOpen ? (
        <div className="flex w-72 flex-col gap-2 p-2">
          <textarea
            autoFocus
            rows={3}
            value={content}
            onChange={(event) => setContent(event.target.value)}
            placeholder="Your note"
            className="w-full resize-y rounded-xs border border-rule bg-transparent px-2 py-1 font-body text-sm text-ink placeholder:text-muted/60 focus:border-primary"
          />
          <div className="flex justify-end gap-2">
            <Button variant="quiet" size="sm" onClick={onDismiss}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={saving}
              disabled={!content.trim()}
              onClick={() => onNote(content.trim())}
            >
              Save note
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <Button variant="quiet" size="sm" loading={saving} onClick={onHighlight}>
            Highlight
          </Button>
          <Button variant="quiet" size="sm" onClick={() => setNoteOpen(true)}>
            Note
          </Button>
          <Button variant="quiet" size="sm" aria-label="Dismiss" onClick={onDismiss}>
            &times;
          </Button>
        </div>
      )}
    </div>
  );
};
