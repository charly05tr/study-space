export interface GeminiModel {
  /** Resource name as the API expects it in the URL, e.g. `models/gemini-2.5-flash`. */
  name: string;
  displayName: string;
}

export interface WritingScores {
  grammar: number;
  vocabulary: number;
  topicMastery: number;
}

export interface WritingIssue {
  quote: string;
  problem: string;
  suggestion: string;
}

/** Forward-looking guidance on writing quality, beyond the issues listed. */
export interface WritingFollowUp {
  overview: string;
  steps: string[];
}

export interface WritingReview {
  /** Language of the note and of the feedback, as named by the model. */
  language: string;
  scores: WritingScores;
  strengths: string[];
  issues: WritingIssue[];
  summary: string;
  /** Absent on reviews saved before it existed. */
  followUp?: WritingFollowUp;
}

/** Recursively optional: what a review looks like while it is still streaming in. */
export type DeepPartial<T> = T extends (infer U)[]
  ? DeepPartial<U>[]
  : T extends object
    ? { [K in keyof T]?: DeepPartial<T[K]> }
    : T;

export type PartialWritingReview = DeepPartial<WritingReview>;

/** A review the server keeps for a note, so history survives across devices. */
export interface SavedWritingReview {
  id: number;
  note: number;
  /** Read-only, so a list across notes can name each one. */
  note_title: string;
  result: WritingReview;
  /** Gemini model id the review was produced with. */
  model: string;
  language: string;
  created_at: string;
}

export interface SaveWritingReviewPayload {
  note: number;
  result: WritingReview;
  model: string;
  language: string;
}
