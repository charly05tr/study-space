import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../config/queryClient';
import { GeminiError, streamReviewWriting } from '../api/gemini.api';
import { noteReviewsApi } from '../api/noteReviews.api';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import { useReviewRunsStore } from '../store/reviewRunsStore';
import type { PartialWritingReview, SavedWritingReview, WritingReview } from '../types';
import { WritingReviewPanel } from './WritingReviewPanel';

vi.mock('../api/gemini.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/gemini.api')>()),
  streamReviewWriting: vi.fn(),
}));
vi.mock('../readApiKey', () => ({ readApiKey: vi.fn().mockResolvedValue('KEY') }));
vi.mock('../api/noteReviews.api', () => ({
  noteReviewsApi: {
    listByNote: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));

const NOTE = 'A note that is comfortably longer than the forty character minimum.';

const finalReview: WritingReview = {
  language: 'English',
  scores: { grammar: 9, vocabulary: 8, topicMastery: 7 },
  strengths: ['Clear'],
  issues: [],
  summary: 'All good.',
};

const savedReview = (id: number, summary: string): SavedWritingReview => ({
  id,
  note: 1,
  result: { ...finalReview, summary },
  model: 'models/m',
  language: 'English',
  created_at: '2026-01-01T10:00:00Z',
});

interface Call {
  onPartial: (partial: PartialWritingReview) => void;
  signal: AbortSignal;
  resolve: (review: WritingReview) => void;
  reject: (error: unknown) => void;
}

/** Every call to the mocked stream, each held open until the test settles it. */
let calls: Call[] = [];

/** What the mocked history endpoint returns; `create` prepends to it. */
let saved: SavedWritingReview[] = [];

let host: HTMLDivElement;
let root: Root;

const panel = (noteId: number) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <WritingReviewPanel text={NOTE} noteId={noteId} onClose={() => {}} />
    </MemoryRouter>
  </QueryClientProvider>
);

const mount = async (strict = false, noteId = 1) => {
  await act(async () => {
    root.render(strict ? <StrictMode>{panel(noteId)}</StrictMode> : panel(noteId));
  });
};

/** Closes the panel the way leaving the note does; the run must carry on. */
const unmount = async () => {
  await act(async () => root.unmount());
  root = createRoot(host);
};

// react-query batches its notifications on a timer, so a microtask flush is not
// enough for a settled query or mutation to reach the DOM.
const flush = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

const buttons = (label: string) =>
  [...host.querySelectorAll('button')].filter((b) => b.textContent === label);

const click = async (label: string) => {
  const button = buttons(label)[0];
  if (!button) throw new Error(`No button "${label}"`);
  await act(async () => button.click());
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  saved = [];
  useReviewRunsStore.getState().abortAll();
  // The store invalidates the app-wide client, so the panel runs on that same one.
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  vi.mocked(noteReviewsApi.listByNote)
    .mockReset()
    .mockImplementation(async () => saved);
  vi.mocked(noteReviewsApi.create)
    .mockReset()
    .mockImplementation(async (payload) => {
      const created = { ...savedReview(99, payload.result.summary), result: payload.result };
      saved = [created, ...saved];
      return created;
    });
  vi.mocked(streamReviewWriting).mockReset();
  vi.mocked(streamReviewWriting).mockImplementation(
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
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('WritingReviewPanel background runs', () => {
  it('auto-starts a run when the note has no reviews', async () => {
    await mount();
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Reading your note');
  });

  it('shows the partial review while streaming and the result once saved', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ scores: { grammar: 9 }, summary: 'Growing' }));

    expect(host.textContent).toContain('Writing your review');
    expect(host.textContent).toContain('Growing');
    expect(noteReviewsApi.create).not.toHaveBeenCalled();

    await act(async () => calls[0].resolve(finalReview));
    await flush();

    expect(host.textContent).toContain('All good.');
    expect(host.textContent).not.toContain('Writing your review');
    expect(noteReviewsApi.create).toHaveBeenCalledTimes(1);
  });

  it('does not abort a run when the panel unmounts, and still saves once', async () => {
    await mount();
    await flush();
    await unmount();

    expect(calls[0].signal.aborted).toBe(false);
    await act(async () => calls[0].resolve(finalReview));
    await flush();

    expect(noteReviewsApi.create).toHaveBeenCalledTimes(1);
  });

  it('reconnects to a run in progress without starting a second stream', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ summary: 'Growing' }));
    await unmount();

    await mount();
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Growing');
    expect(host.textContent).toContain('Writing your review');
    expect(buttons('New review')[0].disabled).toBe(true);

    await act(async () => calls[0].onPartial({ summary: 'Grown' }));
    expect(host.textContent).toContain('Grown');
  });

  it('shows the latest saved review and waits for "New review"', async () => {
    saved = [savedReview(2, 'Newest saved'), savedReview(1, 'Older saved')];
    await mount();
    await flush();

    expect(host.textContent).toContain('Newest saved');
    expect(streamReviewWriting).not.toHaveBeenCalled();

    await click('New review');
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('Reading your note');
    expect(buttons('New review')[0].disabled).toBe(true);
  });

  it('falls back to auto-starting when the history fetch fails', async () => {
    vi.mocked(noteReviewsApi.listByNote).mockRejectedValue(new Error('500'));
    await mount();
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
  });

  it('cancels with no save and no error', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ summary: 'Half' }));
    await click('Cancel');
    await flush();

    expect(calls[0].signal.aborted).toBe(true);
    expect(host.textContent).not.toContain('Could not review');
    expect(noteReviewsApi.create).not.toHaveBeenCalled();
    // The cancel must not restart the run it just ended.
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(buttons('New review')[0].disabled).toBe(false);
  });

  it('tells the user when the review could not be saved', async () => {
    vi.mocked(noteReviewsApi.create).mockRejectedValue(new Error('500'));
    await mount();
    await flush();
    await act(async () => calls[0].resolve(finalReview));
    await flush();

    expect(host.textContent).toContain('All good.');
    expect(host.textContent).toContain('could not be saved');
  });

  it('does not start a second run when reopened after the first finished unobserved', async () => {
    await mount();
    await flush();
    await unmount();

    await act(async () => calls[0].resolve(finalReview));
    await flush();
    await mount();
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(host.textContent).toContain('All good.');
  });

  it('retries a failed save from the panel', async () => {
    vi.mocked(noteReviewsApi.create).mockRejectedValueOnce(new Error('500'));
    await mount();
    await flush();
    await act(async () => calls[0].resolve(finalReview));
    await flush();
    expect(host.textContent).toContain('could not be saved');

    await click('Retry save');
    await flush();

    expect(noteReviewsApi.create).toHaveBeenCalledTimes(2);
    expect(host.textContent).not.toContain('could not be saved');
    expect(host.textContent).toContain('All good.');
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
  });

  it('asks before "New review" discards an unsaved result', async () => {
    vi.mocked(noteReviewsApi.create).mockRejectedValue(new Error('500'));
    await mount();
    await flush();
    await act(async () => calls[0].resolve(finalReview));
    await flush();

    await click('New review');
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);

    await click('Discard unsaved review?');
    await flush();
    expect(streamReviewWriting).toHaveBeenCalledTimes(2);
  });

  it('dismisses an unsaved result', async () => {
    vi.mocked(noteReviewsApi.create).mockRejectedValue(new Error('500'));
    await mount();
    await flush();
    await act(async () => calls[0].resolve(finalReview));
    await flush();
    await click('Dismiss');

    expect(host.textContent).not.toContain('could not be saved');
    expect(host.textContent).not.toContain('All good.');
  });

  it('starts only one run under StrictMode', async () => {
    await mount(true);
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(calls[0].signal.aborted).toBe(false);
    await act(async () => calls[0].resolve(finalReview));
    await flush();

    expect(host.textContent).toContain('All good.');
    expect(noteReviewsApi.create).toHaveBeenCalledTimes(1);
  });

  it('shows an error on reopen, and clears the stale partial on retry', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ summary: 'OLD' }));
    await act(async () => calls[0].reject(new GeminiError('Gemini is temporarily unavailable.')));
    await flush();
    await unmount();

    await mount();
    await flush();
    expect(host.textContent).toContain('Could not review this note');
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);

    await click('Try again');
    await flush();
    expect(calls).toHaveLength(2);
    expect(host.textContent).not.toContain('OLD');

    await act(async () => calls[0].onPartial({ summary: 'STALE' }));
    expect(host.textContent).not.toContain('STALE');

    await act(async () => calls[1].onPartial({ summary: 'NEW' }));
    expect(host.textContent).toContain('NEW');
  });

  it('clears an error on dismiss', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].reject(new GeminiError('Gemini is temporarily unavailable.')));
    await flush();
    await click('Dismiss');

    expect(host.textContent).not.toContain('Could not review this note');
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
  });

  it('keeps runs for different notes apart', async () => {
    await mount(false, 1);
    await flush();
    await unmount();
    await mount(false, 2);
    await flush();

    expect(streamReviewWriting).toHaveBeenCalledTimes(2);
    expect(calls.map((call) => call.signal.aborted)).toEqual([false, false]);
  });

  it('renders garbage partials without crashing', async () => {
    await mount();
    await flush();
    await act(async () =>
      calls[0].onPartial({
        scores: 'high',
        summary: 42,
        strengths: [null, 'Solid'],
        issues: [null, 5, { quote: 7, problem: 'Real problem' }, {}],
      } as unknown as PartialWritingReview),
    );

    expect(host.textContent).toContain('Solid');
    expect(host.textContent).toContain('Real problem');
    expect(host.textContent).not.toContain('Scores');
  });
});
