import axios from '../../../config/axios';
import type { ProgressPayload, ReaderPayload, ReadingPosition } from '../types';

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

  /**
   * Read separately from the reader payload on purpose. That one is cached for
   * the life of the tab because the HTML is huge; this is the one field that
   * changes while you read, so it has to come off the wire every time.
   */
  readingPosition: async (sourceId: number): Promise<ReadingPosition> => {
    const response = await axios.get(`${BASE_URL}/${sourceId}/`);
    return {
      last_anchor: response.data.last_anchor ?? '',
      last_position: response.data.last_position ?? 0,
    };
  },

  /**
   * Its own route, not the source's PATCH: that one now writes the title, and
   * the two must not share a door. This fires many times a minute while you
   * scroll; a rename happens once and on purpose.
   */
  saveProgress: async (sourceId: number, progress: ProgressPayload): Promise<void> => {
    await axios.patch(`${BASE_URL}/${sourceId}/progress/`, progress);
  },
};
