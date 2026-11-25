import { MAX_OPTIONS, MIN_OPTIONS } from './types';
import type { Question, QuestionInput, QuestionType } from './types';

/** Mirrors the backend: a longer text is rejected there. */
export const MAX_QUESTION_TEXT = 5000;
export const MAX_OPTION_TEXT = 500;

/** What the question form edits: every type's fields at once, so switching type loses nothing. */
export interface QuestionDraft {
  type: QuestionType;
  prompt: string;
  options: string[];
  /** Index into `options` for multiple choice; null until the user picks one. */
  correctIndex: number | null;
  /** True/false answer; null until the user picks one. */
  trueFalse: boolean | null;
  /** Reference answer for short answer. */
  answer: string;
  explanation: string;
}

export interface DraftErrors {
  prompt?: string;
  options?: string;
  correct?: string;
  answer?: string;
  explanation?: string;
}

export const emptyDraft = (type: QuestionType = 'multiple_choice'): QuestionDraft => ({
  type,
  prompt: '',
  options: ['', ''],
  correctIndex: null,
  trueFalse: null,
  answer: '',
  explanation: '',
});

export const draftFromQuestion = (question: Question): QuestionDraft => {
  const draft = emptyDraft(question.type);
  draft.prompt = question.prompt;
  draft.explanation = question.explanation;

  if (question.type === 'multiple_choice') {
    draft.options = [...question.options];
    draft.correctIndex = typeof question.correct_answer === 'number' ? question.correct_answer : null;
  } else if (question.type === 'true_false') {
    draft.trueFalse = typeof question.correct_answer === 'boolean' ? question.correct_answer : null;
  } else {
    draft.answer = typeof question.correct_answer === 'string' ? question.correct_answer : '';
  }
  return draft;
};

export const canAddOption = (draft: QuestionDraft): boolean => draft.options.length < MAX_OPTIONS;
export const canRemoveOption = (draft: QuestionDraft): boolean =>
  draft.options.length > MIN_OPTIONS;

export const addOption = (draft: QuestionDraft): QuestionDraft =>
  canAddOption(draft) ? { ...draft, options: [...draft.options, ''] } : draft;

export const setOption = (draft: QuestionDraft, index: number, text: string): QuestionDraft => ({
  ...draft,
  options: draft.options.map((option, i) => (i === index ? text : option)),
});

/** Removes an option, keeping the correct answer pointing at the same text. */
export const removeOption = (draft: QuestionDraft, index: number): QuestionDraft => {
  if (!canRemoveOption(draft)) return draft;

  let correctIndex = draft.correctIndex;
  if (correctIndex !== null) {
    if (correctIndex === index) correctIndex = null;
    else if (correctIndex > index) correctIndex -= 1;
  }
  return { ...draft, options: draft.options.filter((_, i) => i !== index), correctIndex };
};

/** Field-level problems, empty when the draft can be saved. */
export const validateDraft = (draft: QuestionDraft): DraftErrors => {
  const errors: DraftErrors = {};
  const prompt = draft.prompt.trim();

  if (!prompt) errors.prompt = 'Write the question.';
  else if (prompt.length > MAX_QUESTION_TEXT) {
    errors.prompt = `Keep the question under ${MAX_QUESTION_TEXT} characters.`;
  }

  if (draft.explanation.trim().length > MAX_QUESTION_TEXT) {
    errors.explanation = `Keep the explanation under ${MAX_QUESTION_TEXT} characters.`;
  }

  if (draft.type === 'multiple_choice') {
    const options = draft.options.map((option) => option.trim());
    if (options.length < MIN_OPTIONS || options.length > MAX_OPTIONS) {
      errors.options = `Use between ${MIN_OPTIONS} and ${MAX_OPTIONS} options.`;
    } else if (options.some((option) => !option)) {
      errors.options = 'Fill in every option, or remove the empty ones.';
    } else if (options.some((option) => option.length > MAX_OPTION_TEXT)) {
      errors.options = `Keep each option under ${MAX_OPTION_TEXT} characters.`;
    } else if (new Set(options.map((option) => option.toLowerCase())).size !== options.length) {
      errors.options = 'Options must be different from each other.';
    }

    if (draft.correctIndex === null || draft.correctIndex >= draft.options.length) {
      errors.correct = 'Mark the correct option.';
    }
  } else if (draft.type === 'true_false') {
    if (draft.trueFalse === null) errors.correct = 'Choose true or false.';
  } else {
    const answer = draft.answer.trim();
    if (!answer) errors.answer = 'Write the reference answer.';
    else if (answer.length > MAX_QUESTION_TEXT) {
      errors.answer = `Keep the answer under ${MAX_QUESTION_TEXT} characters.`;
    }
  }

  return errors;
};

export const hasErrors = (errors: DraftErrors): boolean => Object.keys(errors).length > 0;

/**
 * The API payload for a valid draft. `annotation` is carried over untouched when
 * editing: the form never changes where a question came from.
 */
export const draftToInput = (draft: QuestionDraft, annotation: number | null): QuestionInput => {
  const base = {
    type: draft.type,
    prompt: draft.prompt.trim(),
    explanation: draft.explanation.trim(),
    annotation,
  };

  if (draft.type === 'multiple_choice') {
    return {
      ...base,
      options: draft.options.map((option) => option.trim()),
      correct_answer: draft.correctIndex ?? 0,
    };
  }
  if (draft.type === 'true_false') {
    return { ...base, options: [], correct_answer: draft.trueFalse ?? false };
  }
  return { ...base, options: [], correct_answer: draft.answer.trim() };
};

export interface PositionPatch {
  id: number;
  position: number;
}

/**
 * The position updates that move one question a step up (`-1`) or down (`1`).
 *
 * The API has no reorder action and does not shift neighbours: `position` is a
 * plain field, and ties break by id. When positions are strictly increasing,
 * swapping the two values is enough. Otherwise (ties from older data) the whole
 * list is renumbered so the move is real.
 */
export const movePatches = (
  questions: readonly Pick<Question, 'id' | 'position'>[],
  index: number,
  direction: -1 | 1,
): PositionPatch[] => {
  const target = index + direction;
  if (index < 0 || index >= questions.length || target < 0 || target >= questions.length) return [];

  const strictlyIncreasing = questions.every(
    (question, i) => i === 0 || question.position > questions[i - 1].position,
  );

  if (strictlyIncreasing) {
    return [
      { id: questions[index].id, position: questions[target].position },
      { id: questions[target].id, position: questions[index].position },
    ];
  }

  const order = questions.map((question) => question.id);
  [order[index], order[target]] = [order[target], order[index]];
  const current = new Map(questions.map((question) => [question.id, question.position]));
  return order
    .map((id, position) => ({ id, position }))
    .filter((patch) => current.get(patch.id) !== patch.position);
};
