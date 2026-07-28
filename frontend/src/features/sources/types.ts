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
  updated_at: string;
}
