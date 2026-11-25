import axios from '../../../config/axios';
import type {
  CreateQuestionPayload,
  CreateQuizPayload,
  Question,
  Quiz,
  QuizFilters,
  QuizSummary,
  UpdateQuestionPayload,
  UpdateQuizPayload,
} from '../types';

const QUIZZES_URL = '/quizzes';
const QUESTIONS_URL = '/questions';

/** Quiz endpoints are unpaginated and scoped to the signed-in user by the server. */
export const quizzesApi = {
  listByStudyspace: async (
    studyspaceId: number,
    filters: QuizFilters = {},
  ): Promise<QuizSummary[]> => {
    const response = await axios.get(`${QUIZZES_URL}/`, {
      params: { studyspace: studyspaceId, ...filters },
    });
    return response.data;
  },

  retrieve: async (quizId: number): Promise<Quiz> => {
    const response = await axios.get(`${QUIZZES_URL}/${quizId}/`);
    return response.data;
  },

  /** Always creates a draft, questions included; one bad question rejects them all. */
  create: async (payload: CreateQuizPayload): Promise<Quiz> => {
    const response = await axios.post(`${QUIZZES_URL}/`, payload);
    return response.data;
  },

  update: async (quizId: number, payload: UpdateQuizPayload): Promise<Quiz> => {
    const response = await axios.patch(`${QUIZZES_URL}/${quizId}/`, payload);
    return response.data;
  },

  /** 400 when the quiz has no questions. */
  publish: async (quizId: number): Promise<Quiz> => {
    const response = await axios.post(`${QUIZZES_URL}/${quizId}/publish/`);
    return response.data;
  },

  remove: async (quizId: number): Promise<void> => {
    await axios.delete(`${QUIZZES_URL}/${quizId}/`);
  },
};

export const questionsApi = {
  listByQuiz: async (quizId: number): Promise<Question[]> => {
    const response = await axios.get(`${QUESTIONS_URL}/`, { params: { quiz: quizId } });
    return response.data;
  },

  create: async (payload: CreateQuestionPayload): Promise<Question> => {
    const response = await axios.post(`${QUESTIONS_URL}/`, payload);
    return response.data;
  },

  update: async (questionId: number, payload: UpdateQuestionPayload): Promise<Question> => {
    const response = await axios.patch(`${QUESTIONS_URL}/${questionId}/`, payload);
    return response.data;
  },

  remove: async (questionId: number): Promise<void> => {
    await axios.delete(`${QUESTIONS_URL}/${questionId}/`);
  },
};
