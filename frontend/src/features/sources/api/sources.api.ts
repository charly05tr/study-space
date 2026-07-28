import axios from '../../../config/axios';
import type { ConvertResult, CreateSourcePayload } from '../types';
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

  convert: async (sourceId: number): Promise<ConvertResult> => {
    const response = await axios.post(`${BASE_URL}/${sourceId}/convert/`, null, {
      // Converting a book is slow; this endpoint returns status, not the HTML.
      timeout: 300000,
    });
    return response.data;
  },
};
