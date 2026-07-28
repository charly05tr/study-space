import type { ReferenceType, SourceType } from './types';

/** Mirrors Source.SourceType labels. */
export const SOURCE_TYPE_LABEL: Record<SourceType, string> = {
  pdf: 'PDF',
  mp4: 'Video',
  mp3: 'Audio',
};

/** Mirrors Reference.ReferenceType labels. */
export const REFERENCE_TYPE_LABEL: Record<ReferenceType, string> = {
  BOOK: 'Book',
  BOOK_CHAPTER: 'Book Chapter',
  JOURNAL_ARTICLE: 'Journal Article',
  CONFERENCE_PAPER: 'Conference Paper',
  THESIS: 'Thesis',
  WEBSITE: 'Website',
  VIDEO: 'Video',
  PODCAST: 'Podcast',
  DOCUMENTATION: 'Documentation',
  OTHER: 'Other',
};
