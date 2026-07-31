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
   * Blocks that could become a concept and are not one yet.
   *
   * The other half of the map: what got absorbed into a larger idea, and what
   * hangs under no heading at all. Without a list to look at, a note written
   * with no structure would have no way of ever reaching the map.
   */
  promotable: async (studyspaceId: number, query: string): Promise<BlockSummary[]> => {
    const response = await axios.get(`${BASE_URL}/`, {
      params: { studyspace: studyspaceId, promotable: true, ...(query ? { q: query } : {}) },
    });
    return response.data;
  },

  /**
   * Hides a block from the map, or brings it back.
   *
   * One of only two writable fields on a block. Its text and type come from the
   * note and the next save would revert anything written here — these two the
   * sync deliberately leaves alone, which is what lets the choice stick.
   */
  setExcluded: async (blockId: string, excluded: boolean): Promise<void> => {
    await axios.patch(`${BASE_URL}/${blockId}/`, { excluded_from_map: excluded });
  },

  /**
   * Raises a block to a concept of its own, or lets it fall back into one.
   *
   * The escape hatch of the whole model: headings and annotations anchor ideas
   * on their own, but a paragraph that IS an idea in itself, written under no
   * title, has no other way in.
   */
  setPromoted: async (blockId: string, promoted: boolean): Promise<void> => {
    await axios.patch(`${BASE_URL}/${blockId}/`, { promoted });
  },
};
