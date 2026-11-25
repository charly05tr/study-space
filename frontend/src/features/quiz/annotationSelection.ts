import type { Annotation } from '../annotations/types';

/** Keeps one huge selection from becoming one enormous request. */
export const MAX_QUIZ_SOURCE_CHARS = 20_000;

/** The slice of an annotation the quiz generator reads. */
export type QuizSourceAnnotation = Pick<
  Annotation,
  'id' | 'source' | 'source_title' | 'annotation_type' | 'page' | 'content'
>;

export interface SourceGroup {
  source: number;
  title: string;
  annotations: QuizSourceAnnotation[];
}

/**
 * Groups annotations by source, keeping the order sources first appear in and,
 * inside each, reading order (page, then creation order of the input).
 */
export const groupBySource = (annotations: readonly QuizSourceAnnotation[]): SourceGroup[] => {
  const groups = new Map<number, SourceGroup>();
  for (const annotation of annotations) {
    const group = groups.get(annotation.source) ?? {
      source: annotation.source,
      title: annotation.source_title,
      annotations: [],
    };
    group.annotations.push(annotation);
    groups.set(annotation.source, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    annotations: [...group.annotations].sort((a, b) => a.page - b.page),
  }));
};

/** Annotations that are still checked, given the ids the user unchecked. */
export const selectAnnotations = <T extends { id: number }>(
  annotations: readonly T[],
  unchecked: ReadonlySet<number>,
): T[] => annotations.filter((annotation) => !unchecked.has(annotation.id));

/** Characters the model will read: the text of the annotations, nothing else. */
export const countSourceChars = (annotations: readonly { content: string }[]): number =>
  annotations.reduce((total, annotation) => total + annotation.content.trim().length, 0);

export const isOverSourceLimit = (chars: number): boolean => chars > MAX_QUIZ_SOURCE_CHARS;

/** Returns a new set with every id of `ids` unchecked (`checked=false`) or checked again. */
export const setChecked = (
  unchecked: ReadonlySet<number>,
  ids: readonly number[],
  checked: boolean,
): Set<number> => {
  const next = new Set(unchecked);
  for (const id of ids) {
    if (checked) next.delete(id);
    else next.add(id);
  }
  return next;
};
