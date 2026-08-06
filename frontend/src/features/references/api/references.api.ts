import axios from '../../../config/axios';
import type { Reference } from '../../studyspaces/types';
import type { ReferencePayload, ReferenceUpdatePayload } from '../types';

const BASE_URL = '/references';

export const referencesApi = {
  create: async (payload: ReferencePayload): Promise<Reference> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  update: async (id: number, payload: ReferenceUpdatePayload): Promise<Reference> => {
    const response = await axios.patch(`${BASE_URL}/${id}/`, payload);
    return response.data;
  },

  remove: async (id: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${id}/`);
  },
};
