import { describe, expect, it } from 'vitest';
import { SLASH_ITEMS, filterSlashItems } from './slashMenuItems';

const titles = (query: string) => filterSlashItems(query).map((item) => item.title);

describe('filterSlashItems', () => {
  it('shows the whole catalogue for an empty query', () => {
    expect(filterSlashItems('')).toHaveLength(SLASH_ITEMS.length);
    expect(filterSlashItems('   ')).toHaveLength(SLASH_ITEMS.length);
  });

  it('matches on the title, case insensitively', () => {
    expect(titles('HEADING')).toEqual(['Heading 1', 'Heading 2', 'Heading 3']);
  });

  it('matches on keywords the title does not contain', () => {
    // Nobody types "bulleted" — the keywords are what make the menu usable.
    expect(titles('ul')).toContain('Bulleted list');
    expect(titles('h2')).toEqual(['Heading 2']);
    expect(titles('ol')).toContain('Numbered list');
  });

  it('matches the markdown shorthands', () => {
    expect(titles('###')).toEqual(['Heading 3']);
    expect(titles('>')).toEqual(['Quote']);
    expect(titles('---')).toEqual(['Divider']);
  });

  it('reaches the table by name and by what people call it', () => {
    expect(titles('table')).toEqual(['Table']);
    expect(titles('rows')).toEqual(['Table']);
    // "grid" and "columns" describe both blocks, and the menu has to keep
    // offering both — with the table first, because it is the one that is
    // literally made of columns.
    expect(titles('grid')).toEqual(['Table', 'Two columns']);
    expect(titles('columns')).toEqual(['Table', 'Two columns']);
  });

  it('returns both lists for the shared "list" keyword', () => {
    expect(titles('list')).toEqual(['Bulleted list', 'Numbered list']);
  });

  it('returns nothing when nothing matches', () => {
    expect(filterSlashItems('zzz')).toEqual([]);
  });

  it('matches word prefixes, not substrings', () => {
    // The regression: substring matching put "Text" under "/h", because its
    // keyword "paragraph" happens to contain an h.
    expect(titles('h')).not.toContain('Text');
    expect(titles('h')).toEqual(expect.arrayContaining(['Heading 1', 'Heading 2', 'Heading 3']));

    // Mid-word matches are gone too: "ist" is not how anyone reaches a list.
    expect(titles('ist')).toEqual([]);
  });

  it('matches the second word of a title', () => {
    // So the keyword lists do not have to repeat every title's own words.
    expect(titles('bullet')).toEqual(['Bulleted list']);
  });

  it('preserves catalogue order rather than ranking', () => {
    expect(titles('h')).toEqual(titles('h').slice().sort(
      (a, b) => SLASH_ITEMS.findIndex((i) => i.title === a) - SLASH_ITEMS.findIndex((i) => i.title === b),
    ));
  });
});
