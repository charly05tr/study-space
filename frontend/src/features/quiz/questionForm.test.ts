import { describe, expect, it } from 'vitest';
import {
  addOption,
  changeType,
  draftFromQuestion,
  hasAnswerContent,
  draftToInput,
  emptyDraft,
  hasErrors,
  movePatches,
  removeOption,
  setOption,
  validateDraft,
} from './questionForm';
import type { QuestionDraft } from './questionForm';
import type { Question } from './types';

const mcDraft = (overrides: Partial<QuestionDraft> = {}): QuestionDraft => ({
  ...emptyDraft('multiple_choice'),
  prompt: 'What maps pages?',
  options: ['Page table', 'TLB'],
  correctIndex: 0,
  ...overrides,
});

describe('validateDraft', () => {
  it('accepts a valid draft of each type', () => {
    expect(hasErrors(validateDraft(mcDraft()))).toBe(false);
    expect(
      hasErrors(validateDraft({ ...emptyDraft('true_false'), prompt: 'x', trueFalse: false })),
    ).toBe(false);
    expect(
      hasErrors(validateDraft({ ...emptyDraft('short_answer'), prompt: 'x', answer: 'y' })),
    ).toBe(false);
  });

  it('needs a prompt', () => {
    expect(validateDraft(mcDraft({ prompt: '   ' })).prompt).toBeDefined();
    expect(validateDraft(mcDraft({ prompt: 'x'.repeat(5001) })).prompt).toBeDefined();
  });

  describe('multiple choice', () => {
    it('needs a marked correct option', () => {
      expect(validateDraft(mcDraft({ correctIndex: null })).correct).toBeDefined();
      expect(validateDraft(mcDraft({ correctIndex: 5 })).correct).toBeDefined();
    });

    it('needs 2 to 8 filled, distinct options', () => {
      expect(validateDraft(mcDraft({ options: ['only'] })).options).toBeDefined();
      expect(validateDraft(mcDraft({ options: ['a', ' '] })).options).toBeDefined();
      expect(validateDraft(mcDraft({ options: ['A', 'a'] })).options).toMatch(/different/);
      expect(
        validateDraft(mcDraft({ options: Array.from({ length: 9 }, (_, i) => `o${i}`) })).options,
      ).toBeDefined();
      expect(validateDraft(mcDraft({ options: ['a', 'b'.repeat(501)] })).options).toBeDefined();
      expect(
        validateDraft(mcDraft({ options: Array.from({ length: 8 }, (_, i) => `o${i}`) })).options,
      ).toBeUndefined();
    });
  });

  it('needs a true/false choice and a short answer', () => {
    expect(validateDraft({ ...emptyDraft('true_false'), prompt: 'x' }).correct).toBeDefined();
    expect(validateDraft({ ...emptyDraft('short_answer'), prompt: 'x', answer: ' ' }).answer)
      .toBeDefined();
  });

  it('ignores fields of other types', () => {
    const draft = { ...emptyDraft('short_answer'), prompt: 'x', answer: 'y', options: ['', ''] };
    expect(hasErrors(validateDraft(draft))).toBe(false);
  });
});

describe('option helpers', () => {
  it('adds up to 8 options and removes down to 2', () => {
    let draft = mcDraft();
    for (let i = 0; i < 10; i += 1) draft = addOption(draft);
    expect(draft.options).toHaveLength(8);

    for (let i = 0; i < 10; i += 1) draft = removeOption(draft, 0);
    expect(draft.options).toHaveLength(2);
  });

  it('keeps the correct answer on the same text when an earlier option is removed', () => {
    const draft = mcDraft({ options: ['a', 'b', 'c'], correctIndex: 2 });
    const next = removeOption(draft, 0);
    expect(next.options).toEqual(['b', 'c']);
    expect(next.correctIndex).toBe(1);
  });

  it('clears the correct answer when the correct option is removed', () => {
    const draft = mcDraft({ options: ['a', 'b', 'c'], correctIndex: 1 });
    expect(removeOption(draft, 1).correctIndex).toBeNull();
  });

  it('leaves the correct answer when a later option is removed', () => {
    const draft = mcDraft({ options: ['a', 'b', 'c'], correctIndex: 0 });
    expect(removeOption(draft, 2).correctIndex).toBe(0);
  });

  it('edits one option', () => {
    expect(setOption(mcDraft(), 1, 'new').options).toEqual(['Page table', 'new']);
  });
});

describe('draftToInput', () => {
  it('trims and shapes a multiple choice question', () => {
    const input = draftToInput(
      mcDraft({ prompt: ' Q ', options: [' a ', 'b'], correctIndex: 1, explanation: ' why ' }),
      7,
    );
    expect(input).toEqual({
      type: 'multiple_choice',
      prompt: 'Q',
      options: ['a', 'b'],
      correct_answer: 1,
      explanation: 'why',
      annotation: 7,
    });
  });

  it('sends empty options for true/false and short answer', () => {
    const tf = draftToInput(
      { ...emptyDraft('true_false'), prompt: 'x', trueFalse: true, options: ['stale', 'stale'] },
      null,
    );
    expect(tf).toMatchObject({ options: [], correct_answer: true, annotation: null });

    const sa = draftToInput({ ...emptyDraft('short_answer'), prompt: 'x', answer: ' ref ' }, null);
    expect(sa).toMatchObject({ options: [], correct_answer: 'ref' });
  });
});

describe('draftFromQuestion', () => {
  const base = {
    id: 1,
    quiz: 1,
    position: 0,
    explanation: 'e',
    annotation: 3,
    created_at: '',
    updated_at: '',
  };

  it('round-trips each type', () => {
    const questions: Question[] = [
      { ...base, type: 'multiple_choice', prompt: 'p', options: ['a', 'b'], correct_answer: 1 },
      { ...base, type: 'true_false', prompt: 'p', options: [], correct_answer: false },
      { ...base, type: 'short_answer', prompt: 'p', options: [], correct_answer: 'ref' },
    ];

    for (const question of questions) {
      const input = draftToInput(draftFromQuestion(question), question.annotation);
      expect(input).toEqual({
        type: question.type,
        prompt: 'p',
        options: question.options,
        correct_answer: question.correct_answer,
        explanation: 'e',
        annotation: 3,
      });
    }
  });
});

describe('movePatches', () => {
  const at = (...positions: number[]) =>
    positions.map((position, i) => ({ id: i + 1, position }));

  it('swaps the positions of two neighbours', () => {
    expect(movePatches(at(0, 1, 2), 1, -1)).toEqual([
      { id: 2, position: 0 },
      { id: 1, position: 1 },
    ]);
    expect(movePatches(at(0, 4, 9), 1, 1)).toEqual([
      { id: 2, position: 9 },
      { id: 3, position: 4 },
    ]);
  });

  it('does nothing at the edges', () => {
    expect(movePatches(at(0, 1), 0, -1)).toEqual([]);
    expect(movePatches(at(0, 1), 1, 1)).toEqual([]);
    expect(movePatches([], 0, 1)).toEqual([]);
  });

  it('renumbers by index when positions tie, so the move takes effect', () => {
    const patches = movePatches(at(0, 0, 0), 2, -1);
    // New order is ids 1, 3, 2: only the ones that changed are patched.
    expect(patches).toEqual([
      { id: 3, position: 1 },
      { id: 2, position: 2 },
    ]);
  });
});

describe('changeType', () => {
  const original = mcDraft({ options: ['Page table', 'TLB', 'Cache'], correctIndex: 2, explanation: 'why' });

  it('carries the prompt and explanation, and clears every answer field', () => {
    const next = changeType(original, 'true_false', original);
    expect(next).toEqual({
      ...emptyDraft('true_false'),
      prompt: original.prompt,
      explanation: 'why',
    });
  });

  it('restores what the question was loaded with when switching back', () => {
    const away = changeType(original, 'short_answer', original);
    const edited = { ...away, prompt: 'Edited prompt', answer: 'typed' };
    const back = changeType(edited, 'multiple_choice', original);
    expect(back.options).toEqual(['Page table', 'TLB', 'Cache']);
    expect(back.correctIndex).toBe(2);
    expect(back.prompt).toBe('Edited prompt');
    expect(back.answer).toBe('');
  });

  it('returns the same draft when the type does not change', () => {
    expect(changeType(original, 'multiple_choice', original)).toBe(original);
  });
});

describe('hasAnswerContent', () => {
  it('only looks at the fields of the current type', () => {
    expect(hasAnswerContent(emptyDraft('multiple_choice'))).toBe(false);
    expect(hasAnswerContent(mcDraft())).toBe(true);
    expect(hasAnswerContent({ ...emptyDraft('true_false'), trueFalse: false })).toBe(true);
    expect(hasAnswerContent({ ...emptyDraft('short_answer'), answer: '  ' })).toBe(false);
    // Stale multiple choice values do not count for a short answer draft.
    expect(hasAnswerContent({ ...mcDraft(), type: 'short_answer' })).toBe(false);
  });
});

describe('draftToInput after a type switch', () => {
  const question: Question = {
    id: 7,
    quiz: 1,
    position: 0,
    type: 'multiple_choice',
    prompt: 'Which?',
    options: ['A', 'B', 'C'],
    correct_answer: 1,
    explanation: '',
    annotation: 12,
    created_at: '',
    updated_at: '',
  };

  it('sends no options and a boolean when a multiple choice question becomes true/false', () => {
    const original = draftFromQuestion(question);
    const draft = { ...changeType(original, 'true_false', original), trueFalse: true };
    expect(draftToInput(draft, question.annotation)).toEqual({
      type: 'true_false',
      prompt: 'Which?',
      explanation: '',
      annotation: 12,
      options: [],
      correct_answer: true,
    });
  });

  it('sends the reference text and no options for short answer', () => {
    const original = draftFromQuestion(question);
    const draft = { ...changeType(original, 'short_answer', original), answer: ' because ' };
    const input = draftToInput(draft, null);
    expect(input.options).toEqual([]);
    expect(input.correct_answer).toBe('because');
  });

  it('sends options and the index together when a short answer becomes multiple choice', () => {
    const sa = draftFromQuestion({ ...question, type: 'short_answer', options: [], correct_answer: 'ref' });
    const draft = { ...changeType(sa, 'multiple_choice', sa), options: ['x', 'y'], correctIndex: 1 };
    expect(hasErrors(validateDraft(draft))).toBe(false);
    expect(draftToInput(draft, null)).toMatchObject({
      type: 'multiple_choice',
      options: ['x', 'y'],
      correct_answer: 1,
    });
  });

  it('never leaks stale values from another type into the payload', () => {
    const stale: QuestionDraft = {
      ...emptyDraft('true_false'),
      prompt: 'p',
      trueFalse: false,
      options: ['leftover', 'options'],
      correctIndex: 1,
      answer: 'leftover text',
    };
    const input = draftToInput(stale, null);
    expect(input.options).toEqual([]);
    expect(input.correct_answer).toBe(false);
  });

  it('blocks a switched question until its new answer is filled in', () => {
    const original = draftFromQuestion(question);
    const draft = changeType(original, 'true_false', original);
    expect(validateDraft(draft).correct).toBeDefined();
  });
});
