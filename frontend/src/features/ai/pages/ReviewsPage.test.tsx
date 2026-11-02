import { QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { queryClient } from '../../../config/queryClient';
import { noteReviewsApi } from '../api/noteReviews.api';
import { noteReviewsQueryKey, studyspaceReviewsQueryKey } from '../hooks/useNoteReviews';
import type { SavedWritingReview, WritingReview } from '../types';
import { ReviewsPage } from './ReviewsPage';

vi.mock('../api/noteReviews.api', () => ({
  noteReviewsApi: {
    listByNote: vi.fn(),
    listByStudyspace: vi.fn(),
    create: vi.fn(),
    remove: vi.fn(),
  },
}));
vi.mock('../../studyspaces/hooks/useStudyspace', () => ({
  useStudyspace: () => ({ data: { title: 'Operating systems' } }),
}));

const result: WritingReview = {
  language: 'English',
  scores: { grammar: 9, vocabulary: 8, topicMastery: 7 },
  strengths: ['Clear'],
  issues: [],
  summary: 'All good.',
  followUp: { overview: 'Lead with the claim.', steps: ['Cut filler'] },
};

const review = (id: number, note: number, title: string, created: string): SavedWritingReview => ({
  id,
  note,
  note_title: title,
  result: { ...result, summary: `Summary ${id}` },
  model: 'models/m',
  language: 'English',
  created_at: created,
});

let listed: SavedWritingReview[] = [];
let host: HTMLDivElement;
let root: Root;

const flush = async () => {
  for (let i = 0; i < 3; i++) await act(async () => new Promise((resolve) => setTimeout(resolve, 0)));
};

const mount = async (path = '/studyspace/3/reviews') => {
  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <MemoryRouter initialEntries={[path]}>
          <Routes>
            <Route path="/studyspace/:studyspaceId/reviews" element={<ReviewsPage />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  });
  await flush();
};

const button = (label: string) =>
  [...host.querySelectorAll('button')].find((b) => b.textContent === label);

const click = async (label: string) => {
  const target = button(label);
  if (!target) throw new Error(`No button "${label}"`);
  await act(async () => target.click());
};

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  listed = [];
  queryClient.clear();
  queryClient.setDefaultOptions({ queries: { retry: false }, mutations: { retry: false } });
  vi.mocked(noteReviewsApi.listByStudyspace)
    .mockReset()
    .mockImplementation(async () => listed);
  vi.mocked(noteReviewsApi.remove)
    .mockReset()
    .mockImplementation(async (id) => {
      listed = listed.filter((item) => item.id !== id);
    });
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
});

describe('ReviewsPage', () => {
  it('asks for the reviews of the studyspace in the route', async () => {
    await mount();

    expect(noteReviewsApi.listByStudyspace).toHaveBeenCalledWith(3);
    expect(host.textContent).toContain('Operating systems');
  });

  it('lists each review with its date, linked note title and scores, in the API order', async () => {
    listed = [
      review(2, 11, 'Scheduling', '2026-02-01T10:00:00Z'),
      review(1, 10, 'Virtual memory', '2026-01-01T10:00:00Z'),
    ];
    await mount();

    const links = [...host.querySelectorAll('li a')] as HTMLAnchorElement[];
    expect(links.map((a) => a.textContent)).toEqual(['Scheduling', 'Virtual memory']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(['/note/11', '/note/10']);
    expect(host.querySelectorAll('li time')).toHaveLength(2);
    expect(host.textContent).toContain('Grammar 9 · Vocabulary 8 · Topic 7');
    // Collapsed until asked for.
    expect(host.textContent).not.toContain('Summary 2');
  });

  it('expands one review to the full result and collapses it again', async () => {
    listed = [
      review(2, 11, 'Scheduling', '2026-02-01T10:00:00Z'),
      review(1, 10, 'Virtual memory', '2026-01-01T10:00:00Z'),
    ];
    await mount();

    await click('Show');
    expect(host.textContent).toContain('Summary 2');
    expect(host.textContent).toContain('How to improve your writing');
    expect(host.textContent).not.toContain('Summary 1');

    await click('Hide');
    expect(host.textContent).not.toContain('Summary 2');
  });

  it('deletes a review after confirming and refreshes both lists', async () => {
    listed = [
      review(2, 11, 'Scheduling', '2026-02-01T10:00:00Z'),
      review(1, 10, 'Virtual memory', '2026-01-01T10:00:00Z'),
    ];
    queryClient.setQueryData(noteReviewsQueryKey(11), [listed[0]]);
    await mount();
    const invalidate = vi.spyOn(queryClient, 'invalidateQueries');

    await click('Delete');
    expect(noteReviewsApi.remove).not.toHaveBeenCalled();
    await click('Delete review?');
    await flush();

    expect(noteReviewsApi.remove).toHaveBeenCalledWith(2);
    const keys = invalidate.mock.calls.map(([filters]) => filters?.queryKey);
    expect(keys).toContainEqual(noteReviewsQueryKey(11));
    // The prefix covers this list, whatever studyspace it belongs to.
    expect(keys).toContainEqual(studyspaceReviewsQueryKey(3).slice(0, 2));
    expect([...host.querySelectorAll('li a')].map((a) => a.textContent)).toEqual(['Virtual memory']);
    invalidate.mockRestore();
  });

  it('shows a not-found state for an invalid studyspace id instead of loading forever', async () => {
    await mount('/studyspace/abc/reviews');

    expect(host.textContent).toContain('Studyspace not found');
    expect(host.querySelector('[aria-label="Loading reviews"]')).toBeNull();
    expect(noteReviewsApi.listByStudyspace).not.toHaveBeenCalled();
  });

  it('shows the empty state', async () => {
    await mount();

    expect(host.textContent).toContain('No reviews yet');
  });

  it('shows a loading state, then the list', async () => {
    let release: (value: SavedWritingReview[]) => void = () => {};
    vi.mocked(noteReviewsApi.listByStudyspace).mockImplementation(
      () => new Promise((resolve) => (release = resolve)),
    );
    await mount();
    expect(host.querySelector('[aria-label="Loading reviews"]')).not.toBeNull();

    await act(async () => release([review(1, 10, 'Virtual memory', '2026-01-01T10:00:00Z')]));
    await flush();
    expect(host.querySelector('[aria-label="Loading reviews"]')).toBeNull();
    expect(host.textContent).toContain('Virtual memory');
  });

  it('shows an error with a retry that refetches', async () => {
    vi.mocked(noteReviewsApi.listByStudyspace).mockRejectedValueOnce(new Error('500'));
    await mount();
    expect(host.textContent).toContain('Could not load the reviews');

    listed = [review(1, 10, 'Virtual memory', '2026-01-01T10:00:00Z')];
    await click('Try again');
    await flush();
    expect(host.textContent).toContain('Virtual memory');
  });
});
