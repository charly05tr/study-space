import { describe, expect, it } from 'vitest';
import {
  buildRun,
  correctLabel,
  initStudy,
  isChoiceCorrect,
  missedQuestions,
  scoreResults,
  seededRandom,
  shuffle,
  studyReducer,
} from './study';
import type { StudyAction, StudyState } from './study';
import type { Question } from './types';

const base = { quiz: 1, position: 0, explanation: '', annotation: null, created_at: '', updated_at: '' };

const mc: Question = {
  ...base,
  id: 1,
  type: 'multiple_choice',
  prompt: 'Pick B',
  options: ['A', 'B', 'C', 'D'],
  correct_answer: 1,
};
const tf: Question = { ...base, id: 2, type: 'true_false', prompt: 'Sky is blue', options: [], correct_answer: true };
const sa: Question = { ...base, id: 3, type: 'short_answer', prompt: 'Define X', options: [], correct_answer: 'X is Y' };

const run = (state: StudyState, ...actions: StudyAction[]): StudyState =>
  actions.reduce(studyReducer, state);

describe('shuffle', () => {
  it('is deterministic for a seed and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const frozen = [...input];
    expect(shuffle(input, seededRandom(42))).toEqual(shuffle(input, seededRandom(42)));
    expect(input).toEqual(frozen);
  });

  it('keeps every element', () => {
    expect(shuffle([1, 2, 3, 4, 5], seededRandom(7)).sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('differs across seeds', () => {
    const items = Array.from({ length: 20 }, (_, i) => i);
    expect(shuffle(items, seededRandom(1))).not.toEqual(shuffle(items, seededRandom(2)));
  });
});

describe('buildRun', () => {
  it('shuffles options but keeps each one tied to its original index', () => {
    const [item] = buildRun([mc], 5);
    expect(item.choices.map((c) => c.label).sort()).toEqual(['A', 'B', 'C', 'D']);
    const right = item.choices.find((c) => isChoiceCorrect(mc, c.value));
    expect(right?.label).toBe('B');
    expect(correctLabel(item)).toBe('B');
  });

  it('never mutates the stored question', () => {
    const before = [...mc.options];
    buildRun([mc], 9);
    expect(mc.options).toEqual(before);
  });

  it('keeps true/false order and gives short answer no choices', () => {
    const [t, s] = buildRun([tf, sa], 3);
    expect(t.choices.map((c) => c.label)).toEqual(['True', 'False']);
    expect(s.choices).toEqual([]);
  });

  it('repeats exactly for the same seed', () => {
    expect(buildRun([mc, tf, sa], 11)).toEqual(buildRun([mc, tf, sa], 11));
  });
});

describe('studyReducer', () => {
  it('grades a multiple choice answer once', () => {
    const start = initStudy(buildRun([mc], 1));
    const wrong = run(start, { type: 'choose', value: 0 });
    expect(wrong.correct).toBe(false);
    expect(wrong.status).toBe('answered');
    // A second click on the right option must not change the grade.
    expect(studyReducer(wrong, { type: 'choose', value: 1 })).toBe(wrong);
    expect(wrong.results).toEqual([{ questionId: 1, correct: false }]);
  });

  it('grades true/false', () => {
    const state = run(initStudy(buildRun([tf], 1)), { type: 'choose', value: true });
    expect(state.correct).toBe(true);
  });

  it('does not treat a boolean as a multiple choice index', () => {
    expect(isChoiceCorrect({ correct_answer: 1 }, true)).toBe(false);
  });

  it('needs reveal before self-marking a short answer, and ignores choices', () => {
    const start = initStudy(buildRun([sa], 1));
    expect(studyReducer(start, { type: 'self_mark', correct: true })).toBe(start);
    expect(studyReducer(start, { type: 'choose', value: true })).toBe(start);

    const marked = run(start, { type: 'reveal' }, { type: 'self_mark', correct: true });
    expect(marked.status).toBe('answered');
    expect(marked.correct).toBe(true);
  });

  it('ignores reveal on auto-graded questions', () => {
    const start = initStudy(buildRun([mc], 1));
    expect(studyReducer(start, { type: 'reveal' })).toBe(start);
  });

  it('only advances after the question is answered, and finishes at the end', () => {
    const start = initStudy(buildRun([tf, sa], 1));
    expect(studyReducer(start, { type: 'next' })).toBe(start);

    const second = run(start, { type: 'choose', value: false }, { type: 'next' });
    expect(second.index).toBe(1);
    expect(second.status).toBe('answering');
    expect(second.finished).toBe(false);

    const done = run(second, { type: 'reveal' }, { type: 'self_mark', correct: false }, { type: 'next' });
    expect(done.finished).toBe(true);
    expect(studyReducer(done, { type: 'next' })).toBe(done);
  });

  it('starts finished when there are no questions', () => {
    expect(initStudy([]).finished).toBe(true);
  });
});

describe('scoring', () => {
  const results = [
    { questionId: 1, correct: true },
    { questionId: 2, correct: false },
    { questionId: 3, correct: false },
  ];

  it('counts, rounds and lists the missed questions', () => {
    expect(scoreResults(results)).toEqual({ correct: 1, total: 3, percent: 33, missedIds: [2, 3] });
  });

  it('is zero for an empty run', () => {
    expect(scoreResults([]).percent).toBe(0);
  });

  it('returns missed questions in their original order', () => {
    expect(missedQuestions([mc, tf, sa], results).map((q) => q.id)).toEqual([2, 3]);
  });
});
