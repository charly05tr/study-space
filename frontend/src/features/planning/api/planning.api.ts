import axios from '../../../config/axios';
import type { StudySession } from '../../sessions/types';
import type {
  CreatePlannedSessionPayload,
  PlannedSession,
  StartPlannedSessionPayload,
  UpdatePlannedSessionPayload,
} from '../types';

const BASE_URL = '/planned-sessions';

export interface RangeQuery {
  from: string;
  to: string;
}

export const planningApi = {
  /**
   * Everything planned inside a window, for one studyspace.
   *
   * A range and not a page, and the endpoint is unpaginated for the same
   * reason: the calendar never wants "the next twenty", it wants exactly the
   * grid it is drawing. Half a grid is worse than a slow one, because nothing
   * on screen would say the other half exists.
   */
  list: async (studyspaceId: number, range: RangeQuery): Promise<PlannedSession[]> => {
    const response = await axios.get<PlannedSession[]>(`${BASE_URL}/`, {
      params: {
        studyspace: studyspaceId,
        starts_after: range.from,
        starts_before: range.to,
      },
    });
    return response.data;
  },

  create: async (payload: CreatePlannedSessionPayload): Promise<PlannedSession> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  update: async (
    id: number,
    payload: UpdatePlannedSessionPayload,
  ): Promise<PlannedSession> => {
    const response = await axios.patch(`${BASE_URL}/${id}/`, payload);
    return response.data;
  },

  /** Returns the real session, not the plan: the caller is opening a timer. */
  start: async (
    id: number,
    payload: StartPlannedSessionPayload,
  ): Promise<StudySession> => {
    const response = await axios.post(`${BASE_URL}/${id}/start/`, payload);
    return response.data;
  },

  /** Keeps the block on the calendar, greyed out. Deleting removes it. */
  cancel: async (id: number): Promise<PlannedSession> => {
    const response = await axios.post(`${BASE_URL}/${id}/cancel/`);
    return response.data;
  },

  remove: async (id: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${id}/`);
  },
};
