import { beforeEach, describe, expect, it, vi } from 'vitest';
import axios from '../../../config/axios';
import { noteReviewsApi } from './noteReviews.api';
import type { WritingReview } from '../types';

vi.mock('../../../config/axios', () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn() },
}));

const result: WritingReview = {
  language: 'English',
  scores: { grammar: 8, vocabulary: 7, topicMastery: 6 },
  strengths: [],
  issues: [],
  summary: 'Fine.',
};

beforeEach(() => vi.clearAllMocks());

describe('noteReviewsApi', () => {
  it('lists the reviews of one note through the note filter', async () => {
    vi.mocked(axios.get).mockResolvedValue({ data: [{ id: 1 }] });

    const reviews = await noteReviewsApi.listByNote(5);

    expect(axios.get).toHaveBeenCalledWith('/note-reviews/', { params: { note: 5 } });
    expect(reviews).toEqual([{ id: 1 }]);
  });

  it('posts the review result with its note, model and language', async () => {
    vi.mocked(axios.post).mockResolvedValue({ data: { id: 2 } });
    const payload = { note: 5, result, model: 'models/gemini-2.5-flash', language: 'English' };

    await noteReviewsApi.create(payload);

    expect(axios.post).toHaveBeenCalledWith('/note-reviews/', payload);
  });

  it('deletes a review by id', async () => {
    vi.mocked(axios.delete).mockResolvedValue({});

    await noteReviewsApi.remove(9);

    expect(axios.delete).toHaveBeenCalledWith('/note-reviews/9/');
  });
});
