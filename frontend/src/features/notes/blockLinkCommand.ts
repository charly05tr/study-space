import { Extension } from '@tiptap/core';
import { PluginKey } from '@tiptap/pm/state';
import { ReactRenderer } from '@tiptap/react';
import Suggestion from '@tiptap/suggestion';
import {
  BlockLinkMenu,
  type BlockLinkMenuHandle,
  type BlockLinkMenuProps,
  type BlockLinkSelection,
} from './components/BlockLinkMenu';

/**
 * `[[` — writing a typed relation without leaving the keyboard.
 *
 * Same shape as SlashCommand, and kept out of `noteExtensions` for the same
 * reason: the popup is UI. The node it inserts, `blockLink`, IS part of the
 * schema and lives there.
 */
export const BlockLinkCommand = Extension.create({
  name: 'blockLinkCommand',

  addProseMirrorPlugins() {
    return [
      Suggestion<never, BlockLinkSelection>({
        editor: this.editor,
        // Distinct from the slash menu's key; see the note there.
        pluginKey: new PluginKey('blockLinkSuggestion'),
        char: '[[',

        // The menu resolves its own results: it is a React component inside the
        // app tree, so it can search with a hook instead of being fed a list.
        items: () => [],

        command: ({ editor, range, props }) => {
          editor
            .chain()
            .focus()
            .deleteRange(range)
            .insertContent([
              {
                type: 'blockLink',
                attrs: {
                  targetId: props.block.id,
                  targetNoteId: props.block.note,
                  kind: props.kind,
                  // Snapshot of the text, so the chip renders with no lookup.
                  label: props.block.text.slice(0, 80),
                },
              },
              // A trailing space, or the caret is left wedged against an atom
              // with nowhere obvious to type next.
              { type: 'text', text: ' ' },
            ])
            .run();
        },

        render: () => {
          let renderer: ReactRenderer<BlockLinkMenuHandle, BlockLinkMenuProps> | null = null;
          let unmount: (() => void) | null = null;

          return {
            onStart: (props) => {
              renderer = new ReactRenderer(BlockLinkMenu, {
                editor: props.editor,
                props: { query: props.query, command: props.command },
              });
              unmount = props.mount(renderer.element);
            },

            onUpdate: (props) => {
              renderer?.updateProps({ query: props.query, command: props.command });
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
