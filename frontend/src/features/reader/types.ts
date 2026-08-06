import type { ConverterMode } from '../studyspaces/types';

/**
 * Payload of POST /sources/:id/convert-pdf-to-html/.
 *
 * `last_anchor` and `last_position` also travel here, but do NOT read them: the
 * whole payload is cached with `staleTime: Infinity` because the HTML can be
 * tens of megabytes, and a reading position cached forever is a reading
 * position that stops updating. Use `useReadingPosition` instead.
 */
export interface ReaderPayload {
  title: string;
  /**
   * The studyspace this source belongs to. Here and not fetched separately
   * because the reader needs it to ask whether a study session is running, and
   * a session is opened per studyspace, never per source.
   */
  study_space: number;
  /**
   * Which converter produced `reader_html`. The frame reads the same fact off
   * the document's own `data-converter` attribute — this is here for anything
   * that has to know before the iframe has loaded.
   */
  converter_mode: ConverterMode;
  last_position: number;
  last_anchor: string;
  reader_html: string;
}

/** What the reader resumes from. Small, and re-read on every open. */
export interface ReadingPosition {
  /** Block id inside the converted HTML, e.g. "b-356a192b79". */
  last_anchor: string;
  /** Seconds, for mp3/mp4. Documents resume by anchor instead. */
  last_position: number;
}

export interface ProgressPayload {
  last_anchor?: string;
  last_position?: number;
}
