import axios from '../../../config/axios';
import type { ProgressPayload, ReaderPayload } from '../types';

const BASE_URL = '/sources';

export const readerApi = {
  /**
   * POST because that is the endpoint the backend exposes. It reads through the
   * stored HTML cache; pass force to regenerate after changing the converter.
   */
  load: async (sourceId: number, force = false): Promise<ReaderPayload> => {
    const response = await axios.post(
      `${BASE_URL}/${sourceId}/convert-pdf-to-html/`,
      null,
      {
        params: force ? { force: 'true' } : undefined,
        // Converting a book takes far longer than the 10s default timeout.
        timeout: 120000,
      },
    );
    return response.data;
  },

  saveProgress: async (sourceId: number, progress: ProgressPayload): Promise<void> => {
    await axios.patch(`${BASE_URL}/${sourceId}/`, progress);
  },
};
