import { Badge, Button } from '../../../components/ui';
import { setChecked } from '../annotationSelection';
import type { SourceGroup } from '../annotationSelection';

interface AnnotationSelectorProps {
  groups: SourceGroup[];
  /** Ids the user unchecked: everything else is checked, so new text defaults to in. */
  unchecked: ReadonlySet<number>;
  disabled?: boolean;
  onChange: (unchecked: Set<number>) => void;
}

/** Annotations grouped by source, each with a checkbox and per-source all/none. */
export const AnnotationSelector = ({
  groups,
  unchecked,
  disabled = false,
  onChange,
}: AnnotationSelectorProps) => (
  <div className="flex flex-col gap-5">
    {groups.map((group) => {
      const ids = group.annotations.map((annotation) => annotation.id);
      const checkedCount = ids.filter((id) => !unchecked.has(id)).length;

      return (
        <fieldset key={group.source} disabled={disabled} className="flex min-w-0 flex-col gap-2">
          <legend className="sr-only">{group.title}</legend>

          <div className="flex items-center justify-between gap-3 border-b border-rule pb-1">
            <p className="min-w-0 truncate font-heading text-sm text-ink">
              {group.title}
              <span className="ml-2 text-xs uppercase tracking-[0.14em] text-muted">
                {checkedCount} / {ids.length}
              </span>
            </p>
            <div className="flex shrink-0 gap-1">
              <Button
                variant="quiet"
                size="sm"
                disabled={disabled || checkedCount === ids.length}
                aria-label={`Select all from ${group.title}`}
                onClick={() => onChange(setChecked(unchecked, ids, true))}
              >
                All
              </Button>
              <Button
                variant="quiet"
                size="sm"
                disabled={disabled || checkedCount === 0}
                aria-label={`Select none from ${group.title}`}
                onClick={() => onChange(setChecked(unchecked, ids, false))}
              >
                None
              </Button>
            </div>
          </div>

          <ul className="flex flex-col">
            {group.annotations.map((annotation) => (
              <li key={annotation.id}>
                <label className="flex cursor-pointer items-start gap-3 rounded-xs px-1 py-2 hover:bg-tint">
                  <input
                    type="checkbox"
                    className="mt-1 size-4 shrink-0 accent-primary"
                    checked={!unchecked.has(annotation.id)}
                    onChange={(event) =>
                      onChange(setChecked(unchecked, [annotation.id], event.target.checked))
                    }
                  />
                  <span className="flex min-w-0 flex-col gap-1">
                    <span className="flex items-center gap-2">
                      <Badge variant={annotation.annotation_type === 'note' ? 'primary' : 'neutral'}>
                        {annotation.annotation_type === 'note' ? 'Note' : 'Highlight'}
                      </Badge>
                      <span className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
                        Page {annotation.page}
                      </span>
                    </span>
                    <span className="line-clamp-3 text-sm text-ink">{annotation.content}</span>
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </fieldset>
      );
    })}
  </div>
);
