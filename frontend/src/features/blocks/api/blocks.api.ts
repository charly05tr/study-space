import axios from '../../../config/axios';
import type { BlockSummary } from '../types';

const BASE_URL = '/blocks';

export const blocksApi = {
  /**
   * Blocks of a whole studyspace, optionally narrowed by text.
   *
   * The endpoint caps its own result set, so this never has to page: the picker
   * shows a handful and the user narrows by typing.
   */
  search: async (studyspaceId: number, query: string): Promise<BlockSummary[]> => {
    const response = await axios.get(`${BASE_URL}/`, {
      params: { studyspace: studyspaceId, ...(query ? { q: query } : {}) },
    });
    return response.data;
  },

  /**
   * Hides a block from the map, or brings it back.
   *
   * The only writable field on a block. Its text and type come from the note
   * and the next save would revert anything written here — this one the sync
   * deliberately leaves alone, which is what lets the choice stick.
   */
  setExcluded: async (blockId: string, excluded: boolean): Promise<void> => {
    await axios.patch(`${BASE_URL}/${blockId}/`, { excluded_from_map: excluded });
  },
};
