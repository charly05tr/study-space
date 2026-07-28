import { Badge, Button, Loading } from '../../../components/ui';
import type { Annotation } from '../../annotations/types';

interface AnnotationPanelProps {
  annotations: Annotation[];
  loading: boolean;
  onSelect: (annotation: Annotation) => void;
  onDelete: (id: number) => void;
  deletingId: number | null;
}

export const AnnotationPanel = ({
  annotations,
  loading,
  onSelect,
  onDelete,
  deletingId,
}: AnnotationPanelProps) => (
  <aside className="flex h-full w-80 shrink-0 flex-col border-l border-rule">
    <h2 className="shrink-0 border-b border-rule px-4 py-3 font-heading text-xs uppercase tracking-[0.18em] text-muted">
      Annotations {annotations.length > 0 && `(${annotations.length})`}
    </h2>

    <div className="min-h-0 flex-1 overflow-y-auto">
      {loading && <Loading label="Loading" />}

      {!loading && annotations.length === 0 && (
        <p className="px-4 py-6 text-sm text-muted">
          Select text in the document to highlight it or attach a note.
        </p>
      )}

      <ul>
        {annotations.map((annotation) => (
          <li key={annotation.id} className="border-b border-rule/60 px-4 py-3">
            <div className="flex items-center justify-between gap-2">
              <Badge variant={annotation.annotation_type === 'note' ? 'primary' : 'neutral'}>
                {annotation.annotation_type}
              </Badge>
              <span className="font-heading text-xs uppercase tracking-[0.12em] text-muted">
                p. {annotation.page}
              </span>
            </div>

            <button
              type="button"
              onClick={() => onSelect(annotation)}
              className="mt-2 block w-full text-left text-sm text-ink hover:text-primary-ink"
            >
              {annotation.content}
            </button>

            <div className="mt-2 flex justify-end">
              <Button
                variant="quiet"
                size="sm"
                loading={deletingId === annotation.id}
                onClick={() => onDelete(annotation.id)}
              >
                Delete
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  </aside>
);
