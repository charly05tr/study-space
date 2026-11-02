import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../config/queryClient';
import { useAuthStore } from '../../auth/store/authStore';
import { GeminiError, streamReviewWriting } from '../api/gemini.api';
import { noteReviewsApi } from '../api/noteReviews.api';
import type { PartialWritingReview, SavedWritingReview, WritingReview } from '../types';
import { useAiSettingsStore } from './aiSettingsStore';
import { useReviewRunsStore } from './reviewRunsStore';

vi.mock('../api/gemini.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/gemini.api')>()),
  streamReviewWriting: vi.fn(),
}));
vi.mock('../readApiKey', () => ({ readApiKey: vi.fn().mockResolvedValue('KEY') }));
vi.mock('../api/noteReviews.api', () => ({
  noteReviewsApi: { listByNote: vi.fn(), create: vi.fn(), remove: vi.fn() },
}));

const finalReview: WritingReview = {
  language: 'English',
  scores: { grammar: 9, vocabulary: 8, topicMastery: 7 },
  strengths: ['Clear'],
  issues: [],
  summary: 'All good.',
};

interface Call {
  onPartial: (partial: PartialWritingReview) => void;
  signal: AbortSignal;
  resolve: (review: WritingReview) => void;
  reject: (error: unknown) => void;
}

/** Every call to the mocked stream, each held open until the test settles it. */
let calls: Call[] = [];

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
const runOf = (noteId: number) => useReviewRunsStore.getState().runs[noteId];
const initialAuth = useAuthStore.getState();
const saved = (id: number): SavedWritingReview => ({
  id,
  note: 1,
  note_title: 'Virtual memory',
  result: finalReview,
  model: 'models/m',
  language: 'English',
  created_at: '2026-01-01T10:00:00Z',
});

afterEach(() => {
  // The logout tests flip the session; later tests must not inherit it.
  useAuthStore.setState(initialAuth);
  queryClient.clear();
});

beforeEach(() => {
  calls = [];
  useReviewRunsStore.getState().abortAll();
  vi.mocked(noteReviewsApi.create).mockReset().mockResolvedValue({} as never);
  vi.mocked(streamReviewWriting)
    .mockReset()
    .mockImplementation(
      (_key, _model, _text, options) =>
        new Promise<WritingReview>((resolve, reject) => {
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

describe('reviewRunsStore', () => {
  it('saves once and invalidates the note history when a run finishes', async () => {
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue();
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].onPartial({ summary: 'Growing' });
    expect(runOf(1).partial).toEqual({ summary: 'Growing' });

    calls[0].resolve(finalReview);
    await settle();

    expect(noteReviewsApi.create).toHaveBeenCalledTimes(1);
    expect(noteReviewsApi.create).toHaveBeenCalledWith({
      note: 1,
      result: finalReview,
      model: 'models/m',
      language: 'English',
    });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['note-reviews', 1] });
    // Saved and refetched: history carries it now, so the entry is dropped.
    expect(runOf(1)).toBeUndefined();
    invalidate.mockRestore();
  });

  it('ignores a start while a run for the same note is in progress', async () => {
    useReviewRunsStore.getState().start(1, 'text');
    useReviewRunsStore.getState().start(1, 'text');
    await settle();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
  });

  it('runs different notes in parallel', async () => {
    useReviewRunsStore.getState().start(1, 'one');
    useReviewRunsStore.getState().start(2, 'two');
    await settle();

    expect(streamReviewWriting).toHaveBeenCalledTimes(2);
    expect(runOf(1).status).toBe('running');
    expect(runOf(2).status).toBe('running');
  });

  it('cancel aborts without saving or recording an error', async () => {
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    useReviewRunsStore.getState().cancel(1);
    await settle();

    expect(calls[0].signal.aborted).toBe(true);
    expect(runOf(1)).toBeUndefined();
    expect(noteReviewsApi.create).not.toHaveBeenCalled();
  });

  it('a cancelled run cannot touch the entry of a newer one', async () => {
    useReviewRunsStore.getState().start(1, 'old');
    await settle();
    useReviewRunsStore.getState().cancel(1);
    useReviewRunsStore.getState().start(1, 'new');
    await settle();
    calls[0].onPartial({ summary: 'STALE' });
    await settle();

    expect(runOf(1).partial).toBeNull();
    expect(runOf(1).text).toBe('new');
  });

  it('records the error and lets it be dismissed', async () => {
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].reject(new GeminiError('Gemini is temporarily unavailable.'));
    await settle();

    expect(runOf(1).status).toBe('error');
    useReviewRunsStore.getState().dismiss(1);
    expect(runOf(1)).toBeUndefined();
  });

  it('keeps the result and flags the entry when the save fails', async () => {
    vi.mocked(noteReviewsApi.create).mockRejectedValue(new Error('500'));
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].resolve(finalReview);
    await settle();

    expect(runOf(1)).toMatchObject({ status: 'done', result: finalReview, saveFailed: true });
  });

  it('errors without calling the model when there is no key', async () => {
    useAiSettingsStore.setState({ encryptedKey: null });
    useReviewRunsStore.getState().start(1, 'text');
    await settle();

    expect(streamReviewWriting).not.toHaveBeenCalled();
    expect(runOf(1).status).toBe('error');
  });

  it('does not save a superseded run that resolves after cancel', async () => {
    // A stream that ignores the abort and resolves anyway.
    vi.mocked(streamReviewWriting).mockImplementationOnce(
      (_key, _model, _text, options) =>
        new Promise<WritingReview>((resolve, reject) => {
          calls.push({
            onPartial: options?.onPartial as Call['onPartial'],
            signal: options?.signal as AbortSignal,
            resolve,
            reject,
          });
        }),
    );
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    useReviewRunsStore.getState().cancel(1);
    calls[0].resolve(finalReview);
    await settle();

    expect(noteReviewsApi.create).not.toHaveBeenCalled();
    expect(runOf(1)).toBeUndefined();
  });

  it('prepends the saved review to a cached history before invalidating', async () => {
    const older = saved(1);
    const created = saved(2);
    queryClient.setQueryData(['note-reviews', 1], [older]);
    vi.mocked(noteReviewsApi.create).mockResolvedValue(created);
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockImplementation(async () => {
      expect(queryClient.getQueryData(['note-reviews', 1])).toEqual([created, older]);
    });
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].resolve(finalReview);
    await settle();

    expect(invalidate).toHaveBeenCalled();
    invalidate.mockRestore();
  });

  it('retries a failed save with the kept result', async () => {
    vi.mocked(noteReviewsApi.create).mockRejectedValueOnce(new Error('500'));
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].resolve(finalReview);
    await settle();
    expect(runOf(1).saveFailed).toBe(true);

    useReviewRunsStore.getState().retrySave(1);
    await settle();

    expect(noteReviewsApi.create).toHaveBeenCalledTimes(2);
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(runOf(1)).toBeUndefined();
  });

  it('refuses dismiss and a new start while a save is in flight', async () => {
    let finishSave: (value: SavedWritingReview) => void = () => {};
    vi.mocked(noteReviewsApi.create).mockImplementation(
      () => new Promise<SavedWritingReview>((resolve) => (finishSave = resolve)),
    );
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].resolve(finalReview);
    await settle();
    expect(runOf(1).saving).toBe(true);

    useReviewRunsStore.getState().dismiss(1);
    useReviewRunsStore.getState().start(1, 'again');
    expect(runOf(1)).toMatchObject({ status: 'done', saving: true });
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);

    finishSave(saved(1));
    await settle();
    expect(runOf(1)).toBeUndefined();
  });

  it('leaves the cache alone when logout happens during the save window', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    queryClient.setQueryData(['note-reviews', 1], [saved(1)]);
    let finishSave: (value: SavedWritingReview) => void = () => {};
    vi.mocked(noteReviewsApi.create).mockImplementation(
      () => new Promise<SavedWritingReview>((resolve) => (finishSave = resolve)),
    );
    useReviewRunsStore.getState().start(1, 'text');
    await settle();
    calls[0].resolve(finalReview);
    await settle();

    useAuthStore.setState({ isAuthenticated: false });
    expect(queryClient.getQueryData(['note-reviews', 1])).toBeUndefined();

    finishSave(saved(2));
    await settle();

    expect(queryClient.getQueryData(['note-reviews', 1])).toBeUndefined();
    expect(useReviewRunsStore.getState().runs).toEqual({});
  });

  it('aborts every run on logout', async () => {
    useAuthStore.setState({ isAuthenticated: true });
    useReviewRunsStore.getState().start(1, 'one');
    useReviewRunsStore.getState().start(2, 'two');
    await settle();

    useAuthStore.setState({ isAuthenticated: false });
    await settle();

    expect(calls.map((call) => call.signal.aborted)).toEqual([true, true]);
    expect(useReviewRunsStore.getState().runs).toEqual({});
    expect(noteReviewsApi.create).not.toHaveBeenCalled();
  });
});
