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

export interface WritingReview {
  /** Language of the note and of the feedback, as named by the model. */
  language: string;
  scores: WritingScores;
  strengths: string[];
  issues: WritingIssue[];
  summary: string;
}
