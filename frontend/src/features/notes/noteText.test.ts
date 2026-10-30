import { describe, expect, it } from 'vitest';
import { extractPlainText } from './noteDocument';

const p = (...text: string[]) => ({
  type: 'paragraph',
  content: text.map((t) => ({ type: 'text', text: t })),
});

describe('extractPlainText', () => {
  it('returns an empty string for an empty or missing note', () => {
    expect(extractPlainText(undefined)).toBe('');
    expect(extractPlainText({})).toBe('');
    expect(extractPlainText({ type: 'doc', content: [{ type: 'paragraph' }] })).toBe('');
  });

  it('puts each textblock on its own line, including nested ones', () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', attrs: { level: 1 }, content: [{ type: 'text', text: 'Title' }] },
        p('Hello ', 'world'),
        { type: 'bulletList', content: [{ type: 'listItem', content: [p('item')] }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('Title\nHello world\nitem');
  });

  it('skips quoted annotations and code', () => {
    const doc = {
      type: 'doc',
      content: [
        p('mine'),
        { type: 'annotation', attrs: { content: 'someone else' } },
        { type: 'codeBlock', content: [{ type: 'text', text: 'const x = 1' }] },
      ],
    };
    expect(extractPlainText(doc)).toBe('mine');
  });
});
