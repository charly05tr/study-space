import { COLUMN_NODE, COLUMNS_NODE } from './columnsNode';
import type { NoteDocument } from './types';

/**
 * The shapes a note can be born in.
 *
 * Fixed, and not user-authored — for now on purpose. A template is a claim
 * about how a method works, and the value of Cornell is that its three regions
 * mean something specific; a builder would turn that into "a note with some
 * boxes". If custom templates arrive later they belong beside these, not
 * instead of them.
 *
 * `build()` returns a fresh tree on every call rather than a shared constant:
 * the document is handed to Tiptap, which mutates it, and a module-level object
 * would come back edited the second time it was used.
 */
export interface NoteTemplate {
  id: string;
  name: string;
  /** One line, shown next to the name while choosing. */
  description: string;
  build: () => NoteDocument;
}

const paragraph = (text?: string): NoteDocument =>
  text ? { type: 'paragraph', content: [{ type: 'text', text }] } : { type: 'paragraph' };

const heading = (level: number, text: string): NoteDocument => ({
  type: 'heading',
  attrs: { level },
  content: [{ type: 'text', text }],
});

const column = (content: NoteDocument[]): NoteDocument => ({
  type: COLUMN_NODE,
  content,
});

export const BLANK_TEMPLATE: NoteTemplate = {
  id: 'blank',
  name: 'Blank',
  description: 'An empty page.',
  // Undefined content lets the schema build its own empty document, which is
  // exactly what a note has always been born as.
  build: () => ({ type: 'doc', content: [paragraph()] }),
};

/**
 * Cornell.
 *
 * Three regions, and the order is the method: you take notes in the right
 * column during the lecture, write the cues on the left afterwards from what
 * you wrote, and only then write the summary from both. The dividers are what
 * make that separation legible on a screen that has no printed rule on it.
 *
 * The note's own title is NOT repeated here. The page already prints it above
 * the editor in display type, and a second copy inside the document would be
 * two things to rename.
 */
export const CORNELL_TEMPLATE: NoteTemplate = {
  id: 'cornell',
  name: 'Cornell',
  description: 'Cues beside notes, with a summary to close.',
  build: () => ({
    type: 'doc',
    content: [
      {
        type: COLUMNS_NODE,
        content: [
          column([
            heading(3, 'Ideas'),
            // Empty paragraphs, not prompt text: placeholder copy inside the
            // document is content the writer has to delete before they can
            // start, and it would reach the concept map as a real block.
            paragraph(),
          ]),
          column([heading(3, 'Notes'), paragraph()]),
        ],
      },
      { type: 'horizontalRule' },
      heading(3, 'Summary'),
      paragraph(),
    ],
  }),
};

export const NOTE_TEMPLATES: NoteTemplate[] = [BLANK_TEMPLATE, CORNELL_TEMPLATE];

export const templateById = (id: string): NoteTemplate =>
  NOTE_TEMPLATES.find((template) => template.id === id) ?? BLANK_TEMPLATE;
