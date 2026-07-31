import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuthStore } from '../../auth/store/authStore';
import type { User } from '../../auth/types';
import { profileApi } from '../api/profile.api';
import type { ProfilePayload } from '../types';

export const profileQueryKey = (userId: number) => ['profile', userId] as const;

/**
 * The signed-in account, read from the server rather than from the store.
 *
 * The store's copy is whatever login returned and is persisted in
 * localStorage, so it can be months old — it is the right thing to render the
 * header from, and the wrong thing to edit against.
 */
export const useProfile = () => {
  const userId = useAuthStore((state) => state.user?.id);

  return useQuery({
    queryKey: profileQueryKey(userId ?? Number.NaN),
    queryFn: () => profileApi.retrieve(userId as number),
    enabled: typeof userId === 'number',
  });
};

export const useUpdateProfile = () => {
  const queryClient = useQueryClient();
  const userId = useAuthStore((state) => state.user?.id);
  const tokens = useAuthStore((state) => state.tokens);
  const setCredentials = useAuthStore((state) => state.setCredentials);

  return useMutation({
    mutationFn: (payload: ProfilePayload) => profileApi.update(userId as number, payload),
    onSuccess: (user: User) => {
      queryClient.setQueryData(profileQueryKey(user.id), user);
      // The header and the guards read the store, not this query. Leaving it
      // behind would show the old name everywhere outside this page until the
      // next login.
      if (tokens) setCredentials(user, tokens);
    },
  });
};
