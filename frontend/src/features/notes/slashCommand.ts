import { Extension } from '@tiptap/core';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import { SlashMenu, type SlashMenuHandle, type SlashMenuProps } from './components/SlashMenu';
import { filterSlashItems, type SlashItem } from './slashMenuItems';

/**
 * The `/` block menu.
 *
 * Kept out of `noteExtensions` on purpose: that array is the schema contract
 * shared with any read-only renderer, and this extension contributes no node,
 * mark or attribute — only an input plugin. Loading it there would drag React
 * into contexts that just need to parse a document.
 */
export const SlashCommand = Extension.create({
  name: 'slashCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<SlashItem, SlashItem>({
        editor: this.editor,
        char: '/',

        // Default `allowedPrefixes` is [' '], so a slash inside a word — a URL
        // or a fraction — never opens the menu.
        // Only the static blocks. The citations are appended by SlashMenu,
        // which can fetch them with a hook because it renders inside the app's
        // React tree — keeping the extension itself free of data loading.
        items: ({ query }) => filterSlashItems(query),

        command: ({ editor, range, props }) => {
          // deleteRange first: the block replaces the "/query" the user typed,
          // it does not get appended after it.
          props.run(editor.chain().focus().deleteRange(range)).run();
        },

        render: () => {
          let renderer: ReactRenderer<SlashMenuHandle, SlashMenuProps> | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(SlashMenu, {
                editor: props.editor,
                props: { items: props.items, query: props.query, command: props.command },
              });
              // `mount` hands positioning to the plugin's Floating UI loop: it
              // anchors to the cursor and follows scroll and resize on its own.
              unmount = props.mount(renderer.element);
            },

            onUpdate: (props) => {
              renderer?.updateProps({ items: props.items, query: props.query, command: props.command });
            },

            onKeyDown: ({ event }) => renderer?.ref?.onKeyDown(event) ?? false,

            onExit: () => {
              unmount?.();
              renderer?.destroy();
              unmount = null;
              renderer = null;
            },
          };
        },
      }),
    ];
  },
});
