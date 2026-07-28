import axios from '../../../config/axios';
import type { Paginated } from '../../../lib/pagination';
import type { StudyspaceDetail, StudyspaceListItem, StudyspacePayload } from '../types';

const BASE_URL = '/studyspaces';

export const studyspacesApi = {
  list: async (page: number): Promise<Paginated<StudyspaceListItem>> => {
    const response = await axios.get(`${BASE_URL}/`, { params: { page } });
    return response.data;
  },

  create: async (data: StudyspacePayload): Promise<StudyspaceDetail> => {
    const response = await axios.post(`${BASE_URL}/`, data);
    return response.data;
  },
};
