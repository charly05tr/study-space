import axios from '../../../config/axios';
import type { User } from '../../auth/types';
import type { ProfilePayload } from '../types';

const BASE_URL = '/users';

/**
 * The account of whoever is holding the token.
 *
 * `UserViewSet.get_object()` returns `request.user` and ignores the pk in the
 * URL entirely, so the id here is only there to satisfy the router — no id but
 * your own can be reached through it, whatever is typed.
 */
export const profileApi = {
  retrieve: async (userId: number): Promise<User> => {
    const response = await axios.get(`${BASE_URL}/${userId}/`);
    return response.data;
  },

  /**
   * PATCH, and the viewset forces `partial=True` on PUT as well — so a field
   * left out is left alone rather than blanked.
   */
  update: async (userId: number, payload: ProfilePayload): Promise<User> => {
    const response = await axios.patch(`${BASE_URL}/${userId}/`, payload);
    return response.data;
  },
};
