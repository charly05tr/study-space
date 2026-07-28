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

export interface SourceMinimal {
  id: number;
  title: string;
  source_type: string;
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
  references: unknown[];
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
