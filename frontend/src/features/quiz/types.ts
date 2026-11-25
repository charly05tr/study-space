export type QuestionType = 'multiple_choice' | 'true_false' | 'short_answer';
export type QuizOrigin = 'ai' | 'manual';
export type QuizStatus = 'draft' | 'published';

export const QUESTION_TYPES: readonly QuestionType[] = [
  'multiple_choice',
  'true_false',
  'short_answer',
];

export const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  multiple_choice: 'Multiple choice',
  true_false: 'True / false',
  short_answer: 'Short answer',
};

/** Mirrors the backend limits so a form can refuse what the API would. */
export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 8;
export const MAX_QUESTIONS_PER_QUIZ = 100;

/** int index (multiple_choice) | bool (true_false) | reference text (short_answer). */
export type CorrectAnswer = number | boolean | string;

/** A question as the editor and the API exchange it, minus server-owned fields. */
export interface QuestionInput {
  type: QuestionType;
  prompt: string;
  /** Always `[]` for anything but multiple choice. */
  options: string[];
  correct_answer: CorrectAnswer;
  explanation: string;
  /** The annotation the question was based on, or null. */
  annotation: number | null;
}

export interface Question extends QuestionInput {
  id: number;
  quiz: number;
  position: number;
  created_at: string;
  updated_at: string;
}

/** What the list endpoint returns: no questions, only their count. */
export interface QuizSummary {
  id: number;
  studyspace: number;
  title: string;
  description: string;
  origin: QuizOrigin;
  status: QuizStatus;
  language: string;
  /** Gemini model id for AI quizzes, empty otherwise. */
  model: string;
  question_count: number;
  created_at: string;
  updated_at: string;
}

export interface Quiz extends QuizSummary {
  /** The topic prompt an AI quiz was generated from. */
  prompt: string;
  questions: Question[];
}

export interface CreateQuizPayload {
  studyspace: number;
  title: string;
  description?: string;
  origin: QuizOrigin;
  prompt?: string;
  language?: string;
  model?: string;
  questions?: QuestionInput[];
}

/** The only fields the backend lets a PATCH change on a quiz. */
export interface UpdateQuizPayload {
  title?: string;
  description?: string;
  language?: string;
}

export interface QuizFilters {
  status?: QuizStatus;
  origin?: QuizOrigin;
}

export interface CreateQuestionPayload extends QuestionInput {
  quiz: number;
  /** Appended after the last question when omitted. */
  position?: number;
}

/** `quiz` cannot change once a question exists. */
export type UpdateQuestionPayload = Partial<QuestionInput> & { position?: number };
