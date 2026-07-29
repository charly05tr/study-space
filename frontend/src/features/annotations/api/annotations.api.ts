import axios from '../../../config/axios';
import type { Annotation, CreateAnnotationPayload } from '../types';

const BASE_URL = '/annotations';

export const annotationsApi = {
  /**
   * AnnotationViewSet disables pagination, so this is the complete set for the
   * source — which is what the reader needs to paint every highlight.
   */
  listBySource: async (sourceId: number): Promise<Annotation[]> => {
    const response = await axios.get(`${BASE_URL}/`, { params: { source: sourceId } });
    return response.data;
  },

  /**
   * Every annotation in a studyspace, across all of its sources — what the note
   * editor offers when inserting a citation.
   */
  listByStudyspace: async (studyspaceId: number): Promise<Annotation[]> => {
    const response = await axios.get(`${BASE_URL}/`, { params: { studyspace: studyspaceId } });
    return response.data;
  },

  create: async (payload: CreateAnnotationPayload): Promise<Annotation> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  remove: async (id: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${id}/`);
  },
};
