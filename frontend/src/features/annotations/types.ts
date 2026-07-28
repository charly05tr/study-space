export type AnnotationType = 'highlight' | 'note';

/**
 * Character offsets inside one block's text content. A selection crossing
 * several blocks produces one entry per block.
 */
export interface AnchorRange {
  anchor: string;
  start: number;
  end: number;
}

export interface Annotation {
  id: number;
  source: number;
  annotation_type: AnnotationType;
  content: string;
  /** Repeats the first range's anchor so a block can be matched without parsing ranges. */
  anchor: string;
  page: number;
  ranges: AnchorRange[];
  created_at: string;
}

export type CreateAnnotationPayload = Omit<Annotation, 'id' | 'created_at'>;
