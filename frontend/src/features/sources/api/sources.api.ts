import axios from '../../../config/axios';
import type { ConvertPayload, ConvertResult, CreateSourcePayload } from '../types';
import { SUPPORTED_SOURCE_TYPE } from '../types';

const BASE_URL = '/sources';

export const sourcesApi = {
  create: async ({ file, study_space, title }: CreateSourcePayload) => {
    const form = new FormData();
    form.append('file', file);
    form.append('source_type', SUPPORTED_SOURCE_TYPE);
    form.append('study_space', String(study_space));
    if (title) form.append('title', title);

    const response = await axios.post(`${BASE_URL}/`, form, {
      // The axios instance pins Content-Type to application/json. Sending
      // FormData under that header makes Django parse the body as JSON and
      // reject it. Undefined lets the browser set multipart/form-data plus the
      // boundary, which it alone can generate.
      headers: { 'Content-Type': undefined },
      // A 50 MB upload does not fit in the 10s default.
      timeout: 300000,
    });
    return response.data;
  },

  /**
   * The title, and only the title. The file is not replaceable: a new one would
   * leave the converted HTML and every annotation anchor describing a document
   * that no longer exists.
   */
  rename: async (sourceId: number, title: string): Promise<{ title: string }> => {
    const response = await axios.patch(`${BASE_URL}/${sourceId}/`, { title });
    return response.data;
  },

  /**
   * Takes the uploaded file, the converted HTML and every annotation on it —
   * the model cascades, and a post_delete signal removes both files from disk.
   */
  remove: async (sourceId: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${sourceId}/`);
  },

  convert: async ({ sourceId, mode }: ConvertPayload): Promise<ConvertResult> => {
    const response = await axios.post(
      `${BASE_URL}/${sourceId}/convert/`,
      // Omitted rather than null: the backend reads an absent mode as "keep the
      // converter this source already has".
      mode ? { mode } : {},
      {
        // Converting a book is slow; this endpoint returns status, not the HTML.
        timeout: 300000,
      },
    );
    return response.data;
  },
};
