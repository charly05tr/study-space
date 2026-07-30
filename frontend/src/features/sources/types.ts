import type { ConverterMode } from '../studyspaces/types';

/** Only PDF is supported end to end: the reader renders converted HTML. */
export const SUPPORTED_SOURCE_TYPE = 'pdf' as const;

/** SourceCreateSerializer: title (optional, inferred from the file), source_type, file, study_space. */
export interface CreateSourcePayload {
  file: File;
  study_space: number;
  title?: string;
}

/** Response of POST /sources/:id/convert/. */
export interface ConvertResult {
  id: number;
  title: string;
  is_converted: boolean;
  converter_mode: ConverterMode;
  updated_at: string;
}

/** Body of POST /sources/:id/convert/. Omitting the mode keeps the source's own. */
export interface ConvertPayload {
  sourceId: number;
  mode?: ConverterMode;
}

export const CONVERTER_LABEL: Record<ConverterMode, string> = {
  reflow: 'Reflow',
  layout: 'Original layout',
};

export const CONVERTER_HINT: Record<ConverterMode, string> = {
  reflow: 'Rebuilds the text so it rewraps to the window and scales with the font size.',
  layout:
    'Reproduces each page exactly where the PDF drew it. Does not rewrap, and drawn lines are not carried over.',
};
