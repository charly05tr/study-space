import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../config/queryClient';
import { GeminiError } from '../../ai/api/gemini.api';
import { useAiSettingsStore } from '../../ai/store/aiSettingsStore';
import { streamQuizGeneration } from '../api/quizGeneration.api';
import { quizzesApi } from '../api/quizzes.api';
import type { GeneratedQuiz, PartialGeneratedQuiz, QuizRequest } from '../prompts/quizGeneration';
import type { Quiz } from '../types';
import { useQuizRunsStore } from './quizRunsStore';

vi.mock('../api/quizGeneration.api', () => ({ streamQuizGeneration: vi.fn() }));
vi.mock('../../ai/readApiKey', () => ({ readApiKey: vi.fn().mockResolvedValue('KEY') }));
vi.mock('../api/quizzes.api', () => ({
  quizzesApi: { create: vi.fn(), listByStudyspace: vi.fn() },
  questionsApi: {},
}));

const request: QuizRequest = {
  topic: 'Paging',
  count: 5,
  types: ['multiple_choice'],
  annotations: [],
};

const generated: GeneratedQuiz = {
  title: 'Paging',
  language: 'English',
  questions: [
    {
      type: 'true_false',
      prompt: 'Page tables map pages to frames.',
      options: [],
      correct_answer: true,
      explanation: '',
      annotation: null,
    },
  ],
};

interface Call {
  onPartial: (partial: PartialGeneratedQuiz) => void;
  signal: AbortSignal;
  resolve: (quiz: GeneratedQuiz) => void;
  reject: (error: unknown) => void;
}

let calls: Call[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const runOf = (studyspaceId: number) => useQuizRunsStore.getState().runs[studyspaceId];

beforeEach(() => {
  calls = [];
  useQuizRunsStore.getState().abortAll();
  vi.mocked(quizzesApi.create)
    .mockReset()
    .mockResolvedValue({ id: 42, studyspace: 1 } as Quiz);
  vi.mocked(quizzesApi.listByStudyspace).mockReset().mockResolvedValue([]);
  vi.mocked(streamQuizGeneration)
    .mockReset()
    .mockImplementation(
      (_key, _model, _request, options) =>
        new Promise<GeneratedQuiz>((resolve, reject) => {
          const signal = options?.signal as AbortSignal;
          calls.push({ onPartial: options?.onPartial as Call['onPartial'], signal, resolve, reject });
          signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
  useAiSettingsStore.setState({
    encryptedKey: { cipher: 'c', iv: 'i' },
    model: 'models/m',
    availableModels: [{ name: 'models/m', displayName: 'm' }],
  });
});

afterEach(() => queryClient.clear());

describe('quizRunsStore', () => {
  it('saves the finished quiz as an AI draft and keeps the entry as saved', async () => {
    useQuizRunsStore.getState().start(1, request);
    await settle();
    calls[0].onPartial({ title: 'Growing' });
    expect(runOf(1).partial).toEqual({ title: 'Growing' });

    calls[0].resolve(generated);
    await settle();

    expect(quizzesApi.create).toHaveBeenCalledWith({
      studyspace: 1,
      title: 'Paging',
      origin: 'ai',
      prompt: 'Paging',
      language: 'English',
      model: 'models/m',
      questions: generated.questions,
    });
    expect(runOf(1)).toMatchObject({ status: 'saved', quizId: 42, saving: false });
  });

  it('ignores a start while a run for the same studyspace is in progress', async () => {
    useQuizRunsStore.getState().start(1, request);
    useQuizRunsStore.getState().start(1, request);
    await settle();

    expect(streamQuizGeneration).toHaveBeenCalledTimes(1);
  });

  it('records the error and saves nothing when generation fails', async () => {
    useQuizRunsStore.getState().start(1, request);
    await settle();
    calls[0].reject(new GeminiError('The quiz was cut off. Try asking for fewer questions.'));
    await settle();

    expect(runOf(1).status).toBe('error');
    expect(quizzesApi.create).not.toHaveBeenCalled();
  });

  it('fails without calling the model when no key is connected', async () => {
    useAiSettingsStore.setState({ encryptedKey: null });
    useQuizRunsStore.getState().start(1, request);
    await settle();

    expect(streamQuizGeneration).not.toHaveBeenCalled();
    expect(runOf(1).status).toBe('error');
  });

  it('cancel aborts the run and leaves no entry and no error', async () => {
    useQuizRunsStore.getState().start(1, request);
    await settle();
    useQuizRunsStore.getState().cancel(1);
    await settle();

    expect(calls[0].signal.aborted).toBe(true);
    expect(runOf(1)).toBeUndefined();
    expect(quizzesApi.create).not.toHaveBeenCalled();
  });

  it('keeps the result when the save fails, and retries it', async () => {
    vi.mocked(quizzesApi.create).mockRejectedValueOnce(new Error('boom'));
    useQuizRunsStore.getState().start(1, request);
    await settle();
    calls[0].resolve(generated);
    await settle();

    expect(runOf(1)).toMatchObject({ status: 'done', saveFailed: true, result: generated });

    useQuizRunsStore.getState().retrySave(1);
    await settle();

    expect(quizzesApi.create).toHaveBeenCalledTimes(2);
    expect(runOf(1)).toMatchObject({ status: 'saved', quizId: 42 });
  });

  describe('retrying a save', () => {
    const failFirstSave = async () => {
      vi.mocked(quizzesApi.create).mockRejectedValueOnce(new Error('response lost'));
      useQuizRunsStore.getState().start(1, request);
      await settle();
      calls[0].resolve(generated);
      await settle();
      expect(runOf(1)).toMatchObject({ saveFailed: true });
    };

    const landedDraft = (overrides: Partial<Quiz> = {}) =>
      ({
        id: 7,
        studyspace: 1,
        title: 'Paging',
        origin: 'ai',
        model: 'models/m',
        question_count: 1,
        created_at: new Date().toISOString(),
        ...overrides,
      }) as Quiz;

    it('reuses the draft the failed attempt already created instead of posting another', async () => {
      await failFirstSave();
      vi.mocked(quizzesApi.listByStudyspace).mockResolvedValue([landedDraft()]);

      useQuizRunsStore.getState().retrySave(1);
      await settle();

      expect(quizzesApi.create).toHaveBeenCalledTimes(1);
      expect(runOf(1)).toMatchObject({ status: 'saved', quizId: 7, saving: false });
    });

    it('does not mistake an older or different quiz for its own draft', async () => {
      await failFirstSave();
      vi.mocked(quizzesApi.listByStudyspace).mockResolvedValue([
        landedDraft({ id: 5, created_at: '2020-01-01T00:00:00Z' }),
        landedDraft({ id: 6, title: 'Other topic' }),
        landedDraft({ id: 8, question_count: 9 }),
        landedDraft({ id: 9, origin: 'manual' }),
      ]);

      useQuizRunsStore.getState().retrySave(1);
      await settle();

      expect(quizzesApi.create).toHaveBeenCalledTimes(2);
      expect(runOf(1)).toMatchObject({ status: 'saved', quizId: 42 });
    });

    it('still saves when the lookup itself fails', async () => {
      await failFirstSave();
      vi.mocked(quizzesApi.listByStudyspace).mockRejectedValue(new Error('offline'));

      useQuizRunsStore.getState().retrySave(1);
      await settle();

      expect(quizzesApi.create).toHaveBeenCalledTimes(2);
      expect(runOf(1)).toMatchObject({ status: 'saved', quizId: 42 });
    });

    it('does not look anything up on the first save', async () => {
      useQuizRunsStore.getState().start(1, request);
      await settle();
      calls[0].resolve(generated);
      await settle();

      expect(quizzesApi.listByStudyspace).not.toHaveBeenCalled();
    });
  });

  it('dismiss drops a finished entry', async () => {
    useQuizRunsStore.getState().start(1, request);
    await settle();
    calls[0].reject(new GeminiError('nope'));
    await settle();

    useQuizRunsStore.getState().dismiss(1);
    expect(runOf(1)).toBeUndefined();
  });

  it('runs different studyspaces in parallel', async () => {
    useQuizRunsStore.getState().start(1, request);
    useQuizRunsStore.getState().start(2, request);
    await settle();

    expect(streamQuizGeneration).toHaveBeenCalledTimes(2);
  });
});
