/** Shape of StudyspaceListSerializer: id, title, tags, created_at. */
export interface StudyspaceListItem {
  id: number;
  title: string;
  /** SlugRelatedField(slug_field="name") — plain strings, not objects. */
  tags: string[];
  created_at: string;
}

export interface NoteMinimal {
  id: number;
  title: string;
}

/** Source.SourceType choices — the stored value, not the label. */
export type SourceType = 'pdf' | 'mp4' | 'mp3';

/**
 * Source.ConverterMode choices.
 *
 * `reflow` rebuilds the PDF as prose: it rewraps to the window and scales with
 * the font size. `layout` reproduces every page where the PDF drew it, so it
 * looks like the original but neither rewraps nor carries vector graphics.
 */
export type ConverterMode = 'reflow' | 'layout';

export interface SourceMinimal {
  id: number;
  title: string;
  source_type: SourceType;
  /** Source.is_converted — stored HTML exists AND matches its converter's version. */
  is_converted: boolean;
  converter_mode: ConverterMode;
}

/** Reference.ReferenceType choices. */
export type ReferenceType =
  | 'BOOK'
  | 'BOOK_CHAPTER'
  | 'JOURNAL_ARTICLE'
  | 'CONFERENCE_PAPER'
  | 'THESIS'
  | 'WEBSITE'
  | 'VIDEO'
  | 'PODCAST'
  | 'DOCUMENTATION'
  | 'OTHER';

/** ReferenceSerializer uses fields = "__all__". */
export interface Reference {
  id: number;
  url: string;
  title: string;
  reference_type: ReferenceType;
  authors: string | null;
  publication_date: string | null;
  studyspace: number;
  created_at: string;
}

/** Shape of StudyspaceDetailSerializer, returned by POST /studyspaces/. */
export interface StudyspaceDetail {
  id: number;
  title: string;
  description: string;
  user: number;
  created_at: string;
  updated_at: string;
  tags: string[];
  notes: NoteMinimal[];
  sources: SourceMinimal[];
  references: Reference[];
}

/**
 * StudyspaceCreateUpdateSerializer accepts exactly these three fields.
 * `description` is required: the model field has no blank=True.
 */
export interface StudyspacePayload {
  title: string;
  description: string;
  tags?: string[];
}
