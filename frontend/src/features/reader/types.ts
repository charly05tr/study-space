/** Payload of POST /sources/:id/convert-pdf-to-html/. */
export interface ReaderPayload {
  title: string;
  /** Seconds, for mp3/mp4. Documents resume by anchor instead. */
  last_position: number;
  /** Block id inside the converted HTML, e.g. "b-356a192b79". */
  last_anchor: string;
  reader_html: string;
}

export interface ProgressPayload {
  last_anchor?: string;
  last_position?: number;
}
