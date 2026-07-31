import axios from '../../../config/axios';
import type { BlockLink, RelationKind } from '../types';

const BASE_URL = '/block-links';

export interface CreateBlockLinkPayload {
  source: string;
  target: string;
  kind: RelationKind;
  /** Why the two are connected. Optional, and the better half of the edge. */
  note?: string;
}

export const blockLinksApi = {
  /**
   * `origin` is not sent: the server stamps it as `graph`.
   *
   * That is the rule the whole model rests on — what is written in a note is
   * governed by the note, and only edges drawn here are the API's to own.
   */
  create: async (payload: CreateBlockLinkPayload): Promise<BlockLink> => {
    const response = await axios.post(`${BASE_URL}/`, payload);
    return response.data;
  },

  /** Refused with a 400 for edges written with `[[`; delete those from the text. */
  remove: async (id: number): Promise<void> => {
    await axios.delete(`${BASE_URL}/${id}/`);
  },

  /**
   * Removes every relation behind one edge of the map.
   *
   * An edge between two concepts can stand on several written links, and
   * leaving any of them alive would redraw the edge on the next refetch — the
   * click would read as a silent failure. All or nothing.
   *
   * Sequential rather than parallel: these are only ever a handful, and a
   * partial failure is far easier to reason about when the order is known.
   */
  removeAll: async (ids: number[]): Promise<void> => {
    for (const id of ids) {
      await axios.delete(`${BASE_URL}/${id}/`);
    }
  },
};
