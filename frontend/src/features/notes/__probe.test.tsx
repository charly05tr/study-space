import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { writeFileSync } from 'node:fs';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { expect, it } from 'vitest';
import { BlockEditor } from './components/BlockEditor';

it('probe', async () => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  Element.prototype.scrollIntoView = () => {};
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  await act(async () => {
    root.render(
      <QueryClientProvider client={qc}>
        <BlockEditor noteId={1} studyspaceId={1} initialContent={null} onSave={async () => {}} />
      </QueryClientProvider>,
    );
  });

  const surface = document.querySelector('.ProseMirror');
  await act(async () => {
    surface?.dispatchEvent(new KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true }));
  });
  // The suggestion plugin watches the document, so type through the editor.
  const lines: string[] = [];
  const dump = (tag: string) => {
    lines.push(`--- ${tag} ---`);
    lines.push('menus(listbox): ' + document.querySelectorAll('[aria-label="Insert block"]').length);
    lines.push('math panels: ' + document.querySelectorAll('#math-source').length);
    lines.push('body children: ' + document.body.children.length);
    document.querySelectorAll('body > *').forEach((el, i) => {
      lines.push(`  body[${i}] <${el.tagName} class="${el.className}"> childCount=${el.children.length}`);
    });
    const editorParent = document.querySelector('.ProseMirror')?.parentElement?.parentElement;
    Array.from(editorParent?.children ?? []).forEach((el, i) => {
      lines.push(`  editorParent[${i}] <${el.tagName} class="${(el as HTMLElement).className}" vis=${(el as HTMLElement).style.visibility}>`);
    });
  };
  dump('after mount');
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  dump('after settle');

  writeFileSync('probe.out.txt', lines.join('\n'));
  expect(true).toBe(true);
});
