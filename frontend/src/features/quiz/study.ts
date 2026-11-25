import type { Question } from './types';

/** Deterministic PRNG (mulberry32): the same seed always yields the same run. */
export const seededRandom = (seed: number): (() => number) => {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Fisher-Yates over a copy: the input is never mutated. */
export const shuffle = <T>(items: readonly T[], random: () => number): T[] => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** An answer the user can pick: an option index (multiple choice) or a boolean (true/false). */
export type ChoiceValue = number | boolean;

export interface Choice {
  label: string;
  /** What `correct_answer` is compared against: the ORIGINAL option index, or the boolean. */
  value: ChoiceValue;
}

export interface RunQuestion {
  question: Question;
  /** Shown in this order. Empty for short answer, which is self-assessed. */
  choices: Choice[];
}

/** Builds the questions of one run. Options are shuffled per run; stored data is untouched. */
export const buildRun = (questions: readonly Question[], seed: number): RunQuestion[] => {
  const random = seededRandom(seed);
  return questions.map((question) => {
    if (question.type === 'multiple_choice') {
      const choices = question.options.map((label, index) => ({ label, value: index }));
      return { question, choices: shuffle(choices, random) };
    }
    if (question.type === 'true_false') {
      return {
        question,
        choices: [
          { label: 'True', value: true },
          { label: 'False', value: false },
        ],
      };
    }
    return { question, choices: [] };
  });
};

/** Auto-grading for multiple choice and true/false. */
export const isChoiceCorrect = (question: Pick<Question, 'correct_answer'>, value: ChoiceValue): boolean =>
  question.correct_answer === value;

/** The label of the right choice, for feedback after a miss. */
export const correctLabel = (item: RunQuestion): string => {
  const right = item.choices.find((choice) => isChoiceCorrect(item.question, choice.value));
  return right?.label ?? String(item.question.correct_answer);
};

export interface QuestionResult {
  questionId: number;
  correct: boolean;
}

/**
 * Where the user is in the current question.
 * `answering`: nothing chosen yet. `revealed`: short answer, reference shown,
 * waiting for the self-mark. `answered`: graded, waiting for Next.
 */
export type StepStatus = 'answering' | 'revealed' | 'answered';

export interface StudyState {
  items: RunQuestion[];
  index: number;
  status: StepStatus;
  /** What was picked on the current question, once answered. */
  selected: ChoiceValue | null;
  /** Grade of the current question, once answered. */
  correct: boolean | null;
  results: QuestionResult[];
  finished: boolean;
}

export type StudyAction =
  | { type: 'choose'; value: ChoiceValue }
  | { type: 'reveal' }
  | { type: 'self_mark'; correct: boolean }
  | { type: 'next' };

export const initStudy = (items: RunQuestion[]): StudyState => ({
  items,
  index: 0,
  status: 'answering',
  selected: null,
  correct: null,
  results: [],
  finished: items.length === 0,
});

const record = (state: StudyState, correct: boolean, selected: ChoiceValue | null): StudyState => ({
  ...state,
  status: 'answered',
  selected,
  correct,
  results: [...state.results, { questionId: state.items[state.index].question.id, correct }],
});

export const studyReducer = (state: StudyState, action: StudyAction): StudyState => {
  if (state.finished) return state;
  const item = state.items[state.index];

  switch (action.type) {
    case 'choose':
      // Only the auto-graded types, only once: a second click must not re-grade.
      if (item.question.type === 'short_answer' || state.status !== 'answering') return state;
      return record(state, isChoiceCorrect(item.question, action.value), action.value);

    case 'reveal':
      return item.question.type === 'short_answer' && state.status === 'answering'
        ? { ...state, status: 'revealed' }
        : state;

    case 'self_mark':
      return item.question.type === 'short_answer' && state.status === 'revealed'
        ? record(state, action.correct, null)
        : state;

    case 'next': {
      if (state.status !== 'answered') return state;
      const index = state.index + 1;
      return {
        ...state,
        index,
        status: 'answering',
        selected: null,
        correct: null,
        finished: index >= state.items.length,
      };
    }
  }
};

export interface Score {
  correct: number;
  total: number;
  /** Whole percent, 0 when nothing was answered. */
  percent: number;
  missedIds: number[];
}

export const scoreResults = (results: readonly QuestionResult[]): Score => {
  const correct = results.filter((result) => result.correct).length;
  return {
    correct,
    total: results.length,
    percent: results.length === 0 ? 0 : Math.round((correct / results.length) * 100),
    missedIds: results.filter((result) => !result.correct).map((result) => result.questionId),
  };
};

/** The questions of a finished run that were missed, in their original order. */
export const missedQuestions = (
  questions: readonly Question[],
  results: readonly QuestionResult[],
): Question[] => {
  const missed = new Set(scoreResults(results).missedIds);
  return questions.filter((question) => missed.has(question.id));
};
