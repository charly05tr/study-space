import type { ChainedCommands } from '@tiptap/core';

export interface SlashItem {
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
export const SLASH_ITEMS: SlashItem[] = [
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
export const filterSlashItems = (query: string): SlashItem[] => {
  const needle = query.trim().toLowerCase();
  if (!needle) return SLASH_ITEMS;

  return SLASH_ITEMS.filter(
    (item) =>
      item.title
        .toLowerCase()
        .split(' ')
        .some((word) => word.startsWith(needle)) ||
      item.keywords.some((keyword) => keyword.startsWith(needle)),
  );
};
