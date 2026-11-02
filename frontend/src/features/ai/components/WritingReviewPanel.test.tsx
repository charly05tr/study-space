import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GeminiError, streamReviewWriting } from '../api/gemini.api';
import { noteReviewsApi } from '../api/noteReviews.api';
import { useAiSettingsStore } from '../store/aiSettingsStore';
import type { PartialWritingReview, WritingReview } from '../types';
import { WritingReviewPanel } from './WritingReviewPanel';

vi.mock('../api/gemini.api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../api/gemini.api')>()),
  streamReviewWriting: vi.fn(),
}));
vi.mock('../readApiKey', () => ({ readApiKey: vi.fn().mockResolvedValue('KEY') }));
vi.mock('../api/noteReviews.api', () => ({
  noteReviewsApi: {
    listByNote: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({}),
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

interface Call {
  onPartial: (partial: PartialWritingReview) => void;
  signal: AbortSignal;
  resolve: (review: WritingReview) => void;
  reject: (error: unknown) => void;
}

/** Every call to the mocked stream, each held open until the test settles it. */
let calls: Call[] = [];

let host: HTMLDivElement;
let root: Root;

const mount = async (strict = false) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const tree = (
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <WritingReviewPanel text={NOTE} noteId={1} onClose={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
  await act(async () => {
    root.render(strict ? <StrictMode>{tree}</StrictMode> : tree);
  });
};

// react-query batches its notifications on a timer, so a microtask flush is not
// enough for a settled mutation to reach the DOM.
const flush = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

const click = async (label: string) => {
  const button = [...host.querySelectorAll('button')].find((b) => b.textContent === label);
  if (!button) throw new Error(`No button "${label}"`);
  await act(async () => button.click());
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  calls = [];
  vi.mocked(noteReviewsApi.create).mockClear();
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

describe('WritingReviewPanel streaming', () => {
  it('saves nothing when unmounted before the run has started', async () => {
    const client = new QueryClient();
    // Sync act: effects run, but mutationFn (async) has not started yet.
    act(() => {
      root.render(
        <QueryClientProvider client={client}>
          <MemoryRouter>
            <WritingReviewPanel text={NOTE} noteId={1} onClose={() => {}} />
          </MemoryRouter>
        </QueryClientProvider>,
      );
    });
    act(() => root.unmount());
    root = createRoot(host);
    await flush();

    expect(streamReviewWriting).not.toHaveBeenCalled();
    expect(noteReviewsApi.create).not.toHaveBeenCalled();
  });

  it('shows the partial review while streaming and saves once on completion', async () => {
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

  it('treats an abort mid-stream as neither an error nor a save', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ summary: 'Half' }));
    await act(async () => calls[0].reject(new DOMException('Aborted', 'AbortError')));

    expect(host.textContent).not.toContain('Could not review');
    expect(noteReviewsApi.create).not.toHaveBeenCalled();
  });

  it('does not save a run that is aborted by unmount while streaming', async () => {
    await mount();
    await flush();
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => calls[0].resolve(finalReview));

    expect(noteReviewsApi.create).not.toHaveBeenCalled();
  });

  it('clears the stale partial on retry and ignores late chunks from the old run', async () => {
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ summary: 'OLD' }));
    await act(async () => calls[0].reject(new GeminiError('Gemini is temporarily unavailable.')));
    await flush();
    expect(host.textContent).toContain('Could not review this note');

    await click('Try again');
    await flush();
    expect(calls).toHaveLength(2);
    expect(host.textContent).not.toContain('OLD');

    await act(async () => calls[0].onPartial({ summary: 'STALE' }));
    expect(host.textContent).not.toContain('STALE');

    await act(async () => calls[1].onPartial({ summary: 'NEW' }));
    expect(host.textContent).toContain('NEW');
  });

  it('ends with a single completed review under StrictMode double-start', async () => {
    await mount(true);
    await flush();

    const live = calls.filter((call) => !call.signal.aborted);
    expect(live).toHaveLength(1);
    await act(async () => live[0].resolve(finalReview));
    await flush();

    expect(host.textContent).toContain('All good.');
    expect(noteReviewsApi.create).toHaveBeenCalledTimes(1);
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
