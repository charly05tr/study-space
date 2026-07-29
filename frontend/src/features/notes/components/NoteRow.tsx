import { useNavigate } from 'react-router-dom';
import { Button } from '../../../components/ui';
import type { NoteMinimal } from '../../studyspaces/types';

interface NoteRowProps {
  note: NoteMinimal;
}

export const NoteRow = ({ note }: NoteRowProps) => {
  const navigate = useNavigate();

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-ink">{note.title}</span>

      {/* No "converted" gate like a source: a note is readable the moment it
          exists, even while still empty. */}
      <Button variant="secondary" size="sm" onClick={() => navigate(`/note/${note.id}`)}>
        Open
      </Button>
    </li>
  );
};
