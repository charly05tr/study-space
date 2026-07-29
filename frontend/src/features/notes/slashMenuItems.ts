import type { ChainedCommands } from '@tiptap/core';
import type { Annotation } from '../annotations/types';
import type { AnnotationNodeAttributes } from './annotationNode';

/** Section headings inside the menu. Shown only when the group changes. */
export const BLOCKS_GROUP = 'Blocks';
export const ANNOTATIONS_GROUP = 'From your sources';

/**
 * How many annotations the menu offers at once. A studyspace accumulates
 * hundreds; a menu that lists them all stops being a menu and becomes a
 * scrollable archive, and buries the blocks underneath it.
 */
export const ANNOTATION_LIMIT = 6;

export interface SlashItem {
  /** Stable across renders — the blocks use their title, annotations their id. */
  key: string;
  group: string;
  title: string;
  /** Shown to the right of the title — what the block is for, not what it is. */
  hint: string;
  /**
   * Extra search terms. The title alone is not enough: nobody types "bulleted",
   * they type "list", "ul" or "-".
   */
  keywords: string[];
  /**
   * Applies the block to an already-focused chain whose `/query` text has been
   * removed. Taking the chain instead of the editor keeps the caller in charge
   * of that cleanup, so no item can forget it.
   */
  run: (chain: ChainedCommands) => ChainedCommands;
}

/**
 * The catalogue behind the `/` menu. Order is deliberate: it is the order the
 * list shows with an empty query, so the blocks a study note reaches for most
 * come first.
 */
const BLOCK_ITEMS: Omit<SlashItem, 'key' | 'group'>[] = [
  {
    title: 'Text',
    hint: 'Plain paragraph',
    keywords: ['paragraph', 'body', 'plain', 'p'],
    run: (chain) => chain.setParagraph(),
  },
  {
    title: 'Heading 1',
    hint: 'Top-level section',
    keywords: ['h1', 'title', 'big', '#'],
    // setNode, not toggleHeading: picking "Heading 1" from a menu should always
    // produce a heading, never silently undo one.
    run: (chain) => chain.setNode('heading', { level: 1 }),
  },
  {
    title: 'Heading 2',
    hint: 'Subsection',
    keywords: ['h2', 'subtitle', '##'],
    run: (chain) => chain.setNode('heading', { level: 2 }),
  },
  {
    title: 'Heading 3',
    hint: 'Minor heading',
    keywords: ['h3', '###'],
    run: (chain) => chain.setNode('heading', { level: 3 }),
  },
  {
    title: 'Bulleted list',
    hint: 'Unordered points',
    keywords: ['bullet', 'unordered', 'ul', 'list', '-', '*'],
    run: (chain) => chain.toggleBulletList(),
  },
  {
    title: 'Numbered list',
    hint: 'Ordered steps',
    keywords: ['number', 'ordered', 'ol', 'list', '1.'],
    run: (chain) => chain.toggleOrderedList(),
  },
  {
    title: 'Quote',
    hint: 'Cite a source',
    keywords: ['blockquote', 'citation', '>'],
    run: (chain) => chain.setBlockquote(),
  },
  {
    title: 'Code',
    hint: 'Monospaced block',
    keywords: ['codeblock', 'snippet', 'pre', '```'],
    run: (chain) => chain.setCodeBlock(),
  },
  {
    title: 'Divider',
    hint: 'Horizontal rule',
    keywords: ['hr', 'rule', 'separator', 'line', '---'],
    run: (chain) => chain.setHorizontalRule(),
  },
];

/** Titles are unique in the catalogue, so they double as stable keys. */
export const SLASH_ITEMS: SlashItem[] = BLOCK_ITEMS.map((item) => ({
  ...item,
  key: item.title,
  group: BLOCKS_GROUP,
}));

/** First line of a quote, for a menu row that must stay one line tall. */
const excerpt = (text: string, limit = 60) => {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > limit ? `${flat.slice(0, limit - 1)}…` : flat;
};

/**
 * Turns a stored annotation into something the menu can insert.
 *
 * The quote travels into the node's attributes rather than staying a foreign
 * key — see the note on AnnotationNode for why the copy is deliberate.
 */
/** One place that maps a stored annotation onto the node's attributes. */
export const annotationToNodeAttrs = (annotation: Annotation): AnnotationNodeAttributes => ({
  annotationId: annotation.id,
  sourceId: annotation.source,
  sourceTitle: annotation.source_title,
  page: annotation.page,
  anchor: annotation.anchor,
  content: annotation.content,
  annotationType: annotation.annotation_type,
});

export const annotationToSlashItem = (annotation: Annotation): SlashItem => ({
  key: `annotation-${annotation.id}`,
  group: ANNOTATIONS_GROUP,
  title: excerpt(annotation.content),
  hint: `p. ${annotation.page}`,
  // Searchable by what it says and by where it came from, because a user
  // remembers one or the other, rarely both.
  keywords: [annotation.source_title.toLowerCase(), annotation.content.toLowerCase()],
  run: (chain) =>
    chain.insertContent({ type: 'annotation', attrs: annotationToNodeAttrs(annotation) }),
});

/** Identifies the row that opens the full picker instead of inserting. */
export const ANNOTATION_SEARCH_KEY = 'annotation-search';

/**
 * The way out of the six-item cap.
 *
 * Always offered when the studyspace has any annotation at all, so `/annotation`
 * reaches it by name — and it doubles as the overflow row, carrying whatever was
 * typed into the picker rather than making the user retype it.
 */
export const createAnnotationSearchItem = (hidden: number): SlashItem => ({
  key: ANNOTATION_SEARCH_KEY,
  group: ANNOTATIONS_GROUP,
  title: 'Search all annotations',
  hint: hidden > 0 ? `${hidden} more` : 'Browse',
  keywords: ['annotation', 'search', 'cite', 'quote', 'source', 'all'],
  // Inserts nothing. The chain it receives has already deleted the typed query,
  // which is exactly what should happen before a picker takes over.
  run: (chain) => chain,
});

/**
 * Prefix match on each word, not substring, and not fuzzy.
 *
 * Substring matching looks equivalent until the query is one letter: "/h" then
 * matches "Text", because its keyword "paragrap**h** contains an h. Nobody
 * typing "h" wants a paragraph. Prefixes are also how people actually type a
 * command menu — from the start of the word, not the middle.
 *
 * Splitting the title on spaces is what lets "list" reach "Bulleted list"
 * without the keyword list having to repeat every title's second word. Fuzzy
 * ranking is deliberately avoided: with nine items it mostly produces surprises.
 */
const matches = (haystacks: string[], needle: string) =>
  haystacks.some((text) =>
    text
      .toLowerCase()
      .split(/\s+/)
      .some((word) => word.startsWith(needle)),
  );

export const filterSlashItems = (query: string): SlashItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_ITEMS;

  return SLASH_ITEMS.filter((item) => matches([item.title, ...item.keywords], needle));
};

/** Newest first. ISO timestamps compare correctly as plain strings. */
export const byRecency = (a: Annotation, b: Annotation) =>
  b.created_at.localeCompare(a.created_at);

export interface AnnotationMatches {
  /** At most ANNOTATION_LIMIT, newest first. */
  items: SlashItem[];
  /** Everything the query matched, so the menu can say what it is hiding. */
  total: number;
}

/**
 * The citations half of the menu.
 *
 * Annotations are filtered as raw rows and only then mapped into items — a
 * studyspace can hold hundreds, and building an object per annotation on every
 * keystroke to throw all but six away is work nobody asked for.
 *
 * Sorted by recency rather than by the API's page order: the list you want when
 * inserting a citation is what you were just reading, not whatever happens to
 * sit on the lowest-numbered page of some source.
 */
export const filterAnnotationItems = (
  query: string,
  annotations: Annotation[],
): AnnotationMatches => {
  const matched = matchAnnotations(query, annotations);

  return {
    items: [...matched].sort(byRecency).slice(0, ANNOTATION_LIMIT).map(annotationToSlashItem),
    total: matched.length,
  };
};

/** Shared by the inline menu and the full picker, so both agree on a match. */
export const matchAnnotations = (query: string, annotations: Annotation[]): Annotation[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return annotations;

  return annotations.filter((annotation) =>
    matches([annotation.content, annotation.source_title], needle),
  );
};
