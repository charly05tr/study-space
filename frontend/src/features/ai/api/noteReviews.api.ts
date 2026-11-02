import axios from '../../../config/axios';
import type { SavedWritingReview, SaveWritingReviewPayload } from '../types';

const BASE_URL = '/note-reviews';

/**
 * Only the review result travels here, never the Gemini key: the model call
 * stays in the browser and the server just keeps what came back.
 */
export const noteReviewsApi = {
  /** Newest first. Unpaginated: the panel lists every review of one note. */
  listByNote: async (noteId: number): Promise<SavedWritingReview[]> => {
    const response = await axios.get(`${BASE_URL}/`, { params: { note: noteId } });
    return response.data;
  },

  /** Newest first. Unpaginated, like the per-note list. */
  listByStudyspace: async (studyspaceId: number): Promise<SavedWritingReview[]> => {
    const response = await axios.get(`${BASE_URL}/`, { params: { studyspace: studyspaceId } });
    return response.data;
  },

  create: async (payload: SaveWritingReviewPayload): Promise<SavedWritingReview> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  remove: async (reviewId: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${reviewId}/`);
  },
};
