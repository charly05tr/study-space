import axios from '../../../config/axios';
import type { StartSessionPayload, StudySession } from '../types';

const BASE_URL = '/study-sessions';

/** DRF's PageNumberPagination envelope. */
interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export const sessionsApi = {
  /** History for one studyspace, newest first. Paginated at PAGE_SIZE=10. */
  list: async (studyspaceId: number, page = 1): Promise<Page<StudySession>> => {
    const response = await axios.get(`${BASE_URL}/`, {
      params: { studyspace: studyspaceId, page },
    });
    return response.data;
  },

  /**
   * The session left running, if any.
   *
   * `active=true` filters on `finished_at__isnull`, and the domain allows only
   * one open session per studyspace — so the first result is the answer.
   */
  active: async (studyspaceId: number): Promise<StudySession | null> => {
    const response = await axios.get<Page<StudySession>>(`${BASE_URL}/`, {
      params: { studyspace: studyspaceId, active: true },
    });
    return response.data.results[0] ?? null;
  },

  start: async (payload: StartSessionPayload): Promise<StudySession> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  /**
   * The count is incremented by the server, not sent by the client: two tabs on
   * the same session would otherwise write the same number twice.
   */
  completePomodoro: async (sessionId: number): Promise<StudySession> => {
    const response = await axios.post(`${BASE_URL}/${sessionId}/complete-pomodoro/`);
    return response.data;
  },

  finish: async (sessionId: number): Promise<StudySession> => {
    const response = await axios.post(`${BASE_URL}/${sessionId}/finish/`);
    return response.data;
  },

  discard: async (sessionId: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${sessionId}/`);
  },
};
