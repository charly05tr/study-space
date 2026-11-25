import axios from '../../../config/axios';
import type {
  ConversionResult,
  CreateFlashcardPayload,
  DueFilters,
  Flashcard,
  FlashcardContent,
  FlashcardFilters,
  FlashcardStats,
  Rating,
} from '../types';

const FLASHCARDS_URL = '/flashcards';

/** Flashcard endpoints are unpaginated and scoped to the signed-in user by the server. */
export const flashcardsApi = {
  listByStudyspace: async (
    studyspaceId: number,
    filters: FlashcardFilters = {},
  ): Promise<Flashcard[]> => {
    const response = await axios.get(`${FLASHCARDS_URL}/`, {
      params: { studyspace: studyspaceId, ...filters },
    });
    return response.data;
  },

  create: async (payload: CreateFlashcardPayload): Promise<Flashcard> => {
    const response = await axios.post(`${FLASHCARDS_URL}/`, payload);
    return response.data;
  },

  /** Never touches the scheduling state: progress survives an edit. */
  update: async (flashcardId: number, payload: Partial<FlashcardContent>): Promise<Flashcard> => {
    const response = await axios.patch(`${FLASHCARDS_URL}/${flashcardId}/`, payload);
    return response.data;
  },

  remove: async (flashcardId: number): Promise<void> => {
    await axios.delete(`${FLASHCARDS_URL}/${flashcardId}/`);
  },

  /** Cards to review now, oldest due first. */
  due: async (studyspaceId: number, { newLimit, limit }: DueFilters = {}): Promise<Flashcard[]> => {
    const response = await axios.get(`${FLASHCARDS_URL}/due/`, {
      params: { studyspace: studyspaceId, new_limit: newLimit, limit },
    });
    return response.data;
  },

  stats: async (studyspaceId: number): Promise<FlashcardStats[]> => {
    const response = await axios.get(`${FLASHCARDS_URL}/stats/`, {
      params: { studyspace: studyspaceId },
    });
    return response.data;
  },

  /** Idempotent: 201 when something was created, 200 otherwise. Same body either way. */
  fromQuestions: async (questionIds: number[]): Promise<ConversionResult> => {
    const response = await axios.post(`${FLASHCARDS_URL}/from-questions/`, {
      question_ids: questionIds,
    });
    return response.data;
  },

  review: async (flashcardId: number, rating: Rating): Promise<Flashcard> => {
    const response = await axios.post(`${FLASHCARDS_URL}/${flashcardId}/review/`, { rating });
    return response.data;
  },

  resetProgress: async (flashcardId: number): Promise<Flashcard> => {
    const response = await axios.post(`${FLASHCARDS_URL}/${flashcardId}/reset-progress/`);
    return response.data;
  },
};
