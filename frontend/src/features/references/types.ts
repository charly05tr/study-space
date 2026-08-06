import type { ReferenceType } from '../studyspaces/types';

/**
 * What ReferenceSerializer accepts on a POST.
 *
 * `authors` and `publication_date` are null/blank on the model, so they travel
 * as null rather than as an empty string: a Reference with no known author is
 * missing the datum, and "" would read as an author whose name is blank.
 */
export interface ReferencePayload {
  studyspace: number;
  url: string;
  title: string;
  reference_type: ReferenceType;
  authors: string | null;
  /** ISO date, the format DateField parses. Never a full timestamp. */
  publication_date: string | null;
}

/** A PATCH. The studyspace is not editable: a citation does not move house. */
export type ReferenceUpdatePayload = Omit<ReferencePayload, 'studyspace'>;

/**
 * The order the type picker offers.
 *
 * Written out instead of derived from REFERENCE_TYPE_LABEL because Object.keys
 * returns string[], and because this order is a decision — printed sources
 * first, then the ones that live on a screen.
 */
export const REFERENCE_TYPES: ReferenceType[] = [
  'BOOK',
  'BOOK_CHAPTER',
  'JOURNAL_ARTICLE',
  'CONFERENCE_PAPER',
  'THESIS',
  'DOCUMENTATION',
  'WEBSITE',
  'VIDEO',
  'PODCAST',
  'OTHER',
];
