import axios from '../../../config/axios';
import type { GraphPayload } from '../types';

export const graphApi = {
  /**
   * The whole map in one request.
   *
   * Not `/blocks/` plus `/block-links/`: that pair is built for the `[[` picker,
   * caps at 50 rows and hides orphans. Two requests would also leave a window
   * where edges point at nodes that have not arrived yet.
   */
  load: async (studyspaceId: number): Promise<GraphPayload> => {
    const response = await axios.get(`/studyspaces/${studyspaceId}/graph/`);
    return response.data;
  },
};
