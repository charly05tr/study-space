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
import { useReviewPanelStore } from '../store/reviewPanelStore';
import { useReviewRunsStore } from '../store/reviewRunsStore';
import type { PartialWritingReview, SavedWritingReview, WritingReview } from '../types';
import { DOCK_DEFAULT_WIDTH } from '../panelGeometry';
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
  note_title: 'Virtual memory',
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

const onClose = vi.fn();

let host: HTMLDivElement;
let root: Root;

const panel = (noteId: number) => (
  <QueryClientProvider client={queryClient}>
    <MemoryRouter>
      <WritingReviewPanel text={NOTE} noteId={noteId} onClose={onClose} />
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
  onClose.mockClear();
  window.innerWidth = 1024;
  window.innerHeight = 768;
  useReviewPanelStore.setState({ mode: 'docked', dockedWidth: DOCK_DEFAULT_WIDTH, floatingRect: null });
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

const dialog = () => host.querySelector('[role="dialog"]') as HTMLElement;
const handle = () => host.querySelector('[role="separator"]') as HTMLElement | null;
const header = () => host.querySelector('header') as HTMLElement;

const keyDown = async (target: EventTarget, key: string, init: KeyboardEventInit = {}) =>
  act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, ...init }));
  });

/** jsdom lacks PointerEvent; React reads these fields off any event of that type. */
class TestPointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  isPrimary: boolean;

  constructor(type: string, init: PointerEventInit = {}) {
    super(type, init);
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'mouse';
    this.isPrimary = init.isPrimary ?? true;
  }
}

const pointer = async (
  target: Element,
  type: string,
  x: number,
  y: number,
  init: PointerEventInit = {},
) =>
  act(async () => {
    target.dispatchEvent(
      new TestPointerEvent(type, {
        bubbles: true,
        cancelable: true,
        clientX: x,
        clientY: y,
        button: 0,
        ...init,
      }),
    );
  });

const resizeWindow = async (width: number, height: number) => {
  window.innerWidth = width;
  window.innerHeight = height;
  await act(async () => {
    window.dispatchEvent(new Event('resize'));
  });
};

const FLOATING = { x: 40, y: 60, width: 500, height: 400 };

describe('review panel persisted preferences', () => {
  const rehydrate = async (value: unknown) => {
    localStorage.setItem('review-panel', JSON.stringify({ state: value, version: 1 }));
    await useReviewPanelStore.persist.rehydrate();
  };

  afterEach(() => localStorage.removeItem('review-panel'));

  it('falls back to defaults for corrupt geometry', async () => {
    await rehydrate({ mode: 'sideways', dockedWidth: 'wide', floatingRect: {} });
    expect(useReviewPanelStore.getState()).toMatchObject({
      mode: 'docked',
      dockedWidth: DOCK_DEFAULT_WIDTH,
      floatingRect: null,
    });

    await rehydrate({ floatingRect: { x: '1', y: NaN, width: null, height: 5 }, dockedWidth: -3 });
    expect(useReviewPanelStore.getState().floatingRect).toBeNull();
    expect(useReviewPanelStore.getState().dockedWidth).toBe(DOCK_DEFAULT_WIDTH);
  });

  it('keeps the valid fields next to a corrupt one', async () => {
    await rehydrate({ mode: 'floating', dockedWidth: 'x', floatingRect: { x: 1, y: 2, width: 400, height: 300 } });
    expect(useReviewPanelStore.getState()).toMatchObject({
      mode: 'floating',
      dockedWidth: DOCK_DEFAULT_WIDTH,
      floatingRect: { x: 1, y: 2, width: 400, height: 300 },
    });
  });

  it('renders a corrupt floating rect without looping', async () => {
    saved = [savedReview(1, 'Saved')];
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: {} as never });
    await mount();
    await flush();

    expect(dialog().style.left).toBe('0px');
    expect(dialog().style.width).not.toContain('NaN');
  });
});

describe('WritingReviewPanel docked width', () => {
  beforeEach(() => {
    saved = [savedReview(1, 'Saved')];
  });

  it('renders a labelled, keyboard-focusable resize handle at the default width', async () => {
    await mount();
    await flush();

    expect(handle()?.getAttribute('aria-label')).toBe('Resize review panel');
    expect(handle()?.tabIndex).toBe(0);
    expect(dialog().style.width).toBe(`${DOCK_DEFAULT_WIDTH}px`);
  });

  it('resizes with the arrow keys and persists the width', async () => {
    await mount();
    await flush();

    await keyDown(handle()!, 'ArrowLeft');
    expect(dialog().style.width).toBe(`${DOCK_DEFAULT_WIDTH + 16}px`);
    await keyDown(handle()!, 'ArrowRight', { shiftKey: true });
    expect(dialog().style.width).toBe(`${DOCK_DEFAULT_WIDTH - 48}px`);
    expect(useReviewPanelStore.getState().dockedWidth).toBe(DOCK_DEFAULT_WIDTH - 48);
  });

  it('clamps to the minimum and to 70% of the viewport', async () => {
    await mount();
    await flush();

    await keyDown(handle()!, 'Home');
    expect(dialog().style.width).toBe('320px');
    await keyDown(handle()!, 'End');
    expect(dialog().style.width).toBe(`${Math.floor(1024 * 0.7)}px`);
  });

  it('resizes by dragging the handle to the left', async () => {
    await mount();
    await flush();

    await pointer(handle()!, 'pointerdown', 600, 100);
    await pointer(handle()!, 'pointermove', 500, 100);
    expect(dialog().style.width).toBe(`${DOCK_DEFAULT_WIDTH + 100}px`);
    await pointer(handle()!, 'pointerup', 500, 100);
    expect(useReviewPanelStore.getState().dockedWidth).toBe(DOCK_DEFAULT_WIDTH + 100);
  });

  it('is a full-width drawer with no handle or mode toggle below the sm breakpoint', async () => {
    await resizeWindow(500, 800);
    await mount();
    await flush();

    expect(handle()).toBeNull();
    expect(buttons('Float')).toHaveLength(0);
    expect(dialog().style.width).toBe('');
    expect(dialog().className).toContain('w-full');
  });
});

describe('WritingReviewPanel floating mode', () => {
  beforeEach(() => {
    saved = [savedReview(1, 'Saved')];
  });

  it('toggles between the dock and a floating window and remembers the mode', async () => {
    await mount();
    await flush();
    expect(dialog().dataset.mode).toBe('docked');

    await click('Float');
    expect(dialog().dataset.mode).toBe('floating');
    expect(handle()).toBeNull();
    expect(useReviewPanelStore.getState().mode).toBe('floating');
    expect(useReviewPanelStore.getState().floatingRect).not.toBeNull();
    // The note stays usable underneath: it keeps z-50 and has no backdrop.
    expect(dialog().className).toContain('z-50');
    expect(host.children).toHaveLength(1);

    await click('Dock');
    expect(dialog().dataset.mode).toBe('docked');
    expect(handle()).not.toBeNull();
    expect(useReviewPanelStore.getState().mode).toBe('docked');
  });

  it('restores the persisted mode and position on open', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    expect(dialog().dataset.mode).toBe('floating');
    expect(dialog().style.left).toBe('40px');
    expect(dialog().style.top).toBe('60px');
    expect(dialog().style.width).toBe('500px');
    expect(dialog().style.height).toBe('400px');
  });

  it('moves by dragging the header, clamped to the viewport', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    await pointer(header(), 'pointerdown', 100, 100);
    await pointer(header(), 'pointermove', 160, 130);
    await pointer(header(), 'pointerup', 160, 130);
    expect(useReviewPanelStore.getState().floatingRect).toMatchObject({ x: 100, y: 90 });

    await pointer(header(), 'pointerdown', 100, 100);
    await pointer(header(), 'pointermove', 5000, 5000);
    await pointer(header(), 'pointerup', 5000, 5000);
    expect(useReviewPanelStore.getState().floatingRect).toMatchObject({ x: 524, y: 368 });
  });

  it('does not start a drag from the header buttons', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    const close = buttons('Close')[0];
    await pointer(close, 'pointerdown', 100, 100);
    await pointer(close, 'pointermove', 300, 300);
    await pointer(close, 'pointerup', 300, 300);
    expect(useReviewPanelStore.getState().floatingRect).toMatchObject({ x: 40, y: 60 });
  });

  it('resizes from a corner', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    const corner = host.querySelector('[data-resize-edge="se"]')!;
    await pointer(corner, 'pointerdown', 540, 460);
    await pointer(corner, 'pointermove', 600, 500);
    await pointer(corner, 'pointerup', 600, 500);
    expect(useReviewPanelStore.getState().floatingRect).toEqual({
      x: 40,
      y: 60,
      width: 560,
      height: 440,
    });
  });

  it('clamps what it shows on a small viewport and restores the saved geometry on a large one', async () => {
    const stored = { x: 560, y: 300, width: 420, height: 400 };
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: stored });
    await mount();
    await flush();

    await resizeWindow(800, 600);
    expect(dialog().style.left).toBe('380px');
    expect(dialog().style.top).toBe('200px');
    // Only the display is clamped: the saved preference is untouched.
    expect(useReviewPanelStore.getState().floatingRect).toEqual(stored);

    await resizeWindow(1024, 768);
    expect(dialog().style.left).toBe('560px');
    expect(dialog().style.top).toBe('300px');
    expect(useReviewPanelStore.getState().floatingRect).toEqual(stored);
  });

  it('does not overwrite the docked width when the viewport shrinks and grows back', async () => {
    useReviewPanelStore.setState({ dockedWidth: 700 });
    await mount();
    await flush();

    await resizeWindow(700, 768);
    expect(dialog().style.width).toBe('489px');
    expect(useReviewPanelStore.getState().dockedWidth).toBe(700);

    await resizeWindow(1024, 768);
    expect(dialog().style.width).toBe('700px');
  });

  it('ends the gesture on pointercancel', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    await pointer(header(), 'pointerdown', 100, 100);
    await pointer(header(), 'pointermove', 130, 120);
    await pointer(header(), 'pointercancel', 130, 120);
    expect(useReviewPanelStore.getState().floatingRect).toMatchObject({ x: 70, y: 80 });

    // The gesture is over: further moves do nothing.
    await pointer(header(), 'pointermove', 400, 400);
    expect(dialog().style.left).toBe('70px');
  });

  it('ignores a second pointer while one gesture is active', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    await pointer(header(), 'pointerdown', 100, 100, { pointerId: 1 });
    await pointer(header(), 'pointerdown', 300, 300, { pointerId: 2, isPrimary: false });
    await pointer(header(), 'pointermove', 500, 500, { pointerId: 2 });
    expect(dialog().style.left).toBe('40px');
    await pointer(header(), 'pointermove', 130, 120, { pointerId: 1 });
    await pointer(header(), 'pointerup', 130, 120, { pointerId: 2 });
    // Another pointer's release does not end the gesture.
    await pointer(header(), 'pointermove', 140, 130, { pointerId: 1 });
    expect(dialog().style.left).toBe('80px');
    await pointer(header(), 'pointerup', 140, 130, { pointerId: 1 });
    expect(useReviewPanelStore.getState().floatingRect).toMatchObject({ x: 80, y: 90 });
  });

  it('ignores non-primary buttons and non-primary pointers', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    await pointer(header(), 'pointerdown', 100, 100, { button: 2 });
    await pointer(header(), 'pointermove', 200, 200);
    expect(dialog().style.left).toBe('40px');

    await pointer(header(), 'pointerdown', 100, 100, { isPrimary: false, pointerId: 5 });
    await pointer(header(), 'pointermove', 200, 200, { pointerId: 5 });
    expect(dialog().style.left).toBe('40px');
  });

  it('ends the gesture when pointer capture is lost', async () => {
    await mount();
    await flush();

    await pointer(handle()!, 'pointerdown', 600, 100);
    await pointer(handle()!, 'pointermove', 550, 100);
    await pointer(handle()!, 'lostpointercapture', 550, 100);
    expect(useReviewPanelStore.getState().dockedWidth).toBe(DOCK_DEFAULT_WIDTH + 50);

    // No ghost drag: later moves are ignored.
    await pointer(handle()!, 'pointermove', 300, 100);
    expect(dialog().style.width).toBe(`${DOCK_DEFAULT_WIDTH + 50}px`);
  });

  it('prevents default on pointerdown and blocks text selection only during the drag', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    const down = new TestPointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 0 });
    await act(async () => {
      header().dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(document.body.style.userSelect).toBe('none');

    await pointer(header(), 'pointerup', 0, 0);
    expect(document.body.style.userSelect).toBe('');
  });

  it('restores text selection when unmounted mid-drag', async () => {
    useReviewPanelStore.setState({ mode: 'floating', floatingRect: FLOATING });
    await mount();
    await flush();

    await pointer(header(), 'pointerdown', 100, 100);
    expect(document.body.style.userSelect).toBe('none');
    await unmount();
    expect(document.body.style.userSelect).toBe('');
  });

  it('keeps a streaming run connected when toggling dock and float', async () => {
    saved = [];
    await mount();
    await flush();
    await act(async () => calls[0].onPartial({ summary: 'Growing' }));
    const before = dialog();

    await click('Float');
    expect(dialog()).toBe(before);
    expect(host.textContent).toContain('Growing');
    await click('Dock');
    expect(dialog()).toBe(before);

    await act(async () => calls[0].onPartial({ summary: 'Grown' }));
    expect(host.textContent).toContain('Grown');
    expect(streamReviewWriting).toHaveBeenCalledTimes(1);
    expect(calls[0].signal.aborted).toBe(false);
  });

  it('closes on Escape and on Close in both modes', async () => {
    await mount();
    await flush();
    await keyDown(document, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(1);

    await click('Float');
    await keyDown(document, 'Escape');
    expect(onClose).toHaveBeenCalledTimes(2);
    await click('Close');
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});

describe('WritingReviewPanel follow-up', () => {
  it('renders the follow-up progressively, guarding partial data', async () => {
    await mount();
    await flush();

    await act(async () => calls[0].onPartial({ summary: 'Growing', followUp: { steps: [] } }));
    expect(host.textContent).not.toContain('How to improve your writing');

    await act(async () =>
      calls[0].onPartial({
        summary: 'Growing',
        followUp: { overview: 'Lead with the claim.', steps: ['Cut filler', undefined] },
      } as unknown as PartialWritingReview),
    );
    expect(host.textContent).toContain('How to improve your writing');
    expect(host.textContent).toContain('Lead with the claim.');
    expect(host.querySelectorAll('ol li')).toHaveLength(1);

    await act(async () =>
      calls[0].onPartial({ followUp: 'garbage' } as unknown as PartialWritingReview),
    );
    expect(host.textContent).not.toContain('How to improve your writing');
  });

  it('shows it on a saved review and omits the section on old ones', async () => {
    saved = [
      {
        ...savedReview(2, 'New'),
        result: { ...finalReview, followUp: { overview: 'Tighten.', steps: ['One', 'Two'] } },
      },
    ];
    await mount();
    await flush();
    expect(host.textContent).toContain('How to improve your writing');
    expect(host.querySelectorAll('ol li')).toHaveLength(2);

    await unmount();
    saved = [savedReview(1, 'Old')];
    queryClient.clear();
    await mount();
    await flush();
    expect(host.textContent).toContain('Old');
    expect(host.textContent).not.toContain('How to improve your writing');
  });
});
