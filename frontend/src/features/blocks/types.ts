/** BlockLink.Kind on the backend. */
export type RelationKind =
  | 'relates'
  | 'supports'
  | 'contradicts'
  | 'defines'
  | 'example_of'
  | 'derives_from';

/**
 * Order matters: it is the order the picker offers them, so the most common
 * choice sits under the cursor when the list opens.
 */
export const RELATION_KINDS: { kind: RelationKind; label: string; hint: string }[] = [
  { kind: 'relates', label: 'Relates to', hint: 'Simply connected' },
  { kind: 'supports', label: 'Supports', hint: 'Backs it up' },
  { kind: 'contradicts', label: 'Contradicts', hint: 'Argues against' },
  { kind: 'defines', label: 'Defines', hint: 'Says what it is' },
  { kind: 'example_of', label: 'Example of', hint: 'A case of it' },
  { kind: 'derives_from', label: 'Derives from', hint: 'Follows from it' },
];

export const RELATION_LABEL: Record<RelationKind, string> = Object.fromEntries(
  RELATION_KINDS.map(({ kind, label }) => [kind, label]),
) as Record<RelationKind, string>;

/** Shape of BlockSerializer. */
export interface BlockSummary {
  id: string;
  note: number;
  note_title: string;
  studyspace: number;
  block_type: string;
  text: string;
  position: number;
  /** Raised to a concept of its own by hand. */
  promoted: boolean;
}

/** Shape of BlockLinkSerializer. */
export interface BlockLink {
  id: number;
  source: string;
  target: string;
  source_text: string;
  target_text: string;
  /** The target no longer exists in any note; the edge outlived the paragraph. */
  target_orphan: boolean;
  kind: RelationKind;
  origin: 'inline' | 'graph';
  note: string;
  created_at: string;
}
