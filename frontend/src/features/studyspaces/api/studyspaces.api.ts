import axios from '../../../config/axios';
import type { Paginated } from '../../../lib/pagination';
import type {
  StudyspaceDetail,
  StudyspaceListItem,
  StudyspacePayload,
  StudyspaceUpdatePayload,
} from '../types';

const BASE_URL = '/studyspaces';

export const studyspacesApi = {
  list: async (page: number): Promise<Paginated<StudyspaceListItem>> => {
    const response = await axios.get(`${BASE_URL}/`, { params: { page } });
    return response.data;
  },

  retrieve: async (id: number): Promise<StudyspaceDetail> => {
    const response = await axios.get(`${BASE_URL}/${id}/`);
    return response.data;
  },

  create: async (data: StudyspacePayload): Promise<StudyspaceDetail> => {
    const response = await axios.post(`${BASE_URL}/`, data);
    return response.data;
  },

  /**
   * PATCH and not PUT: a PUT would need title and description on every edit,
   * and would read an absent `tags` as an instruction to clear them.
   */
  update: async (id: number, data: StudyspaceUpdatePayload): Promise<StudyspaceDetail> => {
    const response = await axios.patch(`${BASE_URL}/${id}/`, data);
    return response.data;
  },
};
