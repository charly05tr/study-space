import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { activeSessionQueryKey } from '../../sessions/hooks/useStudySessions';
import { planningApi, type RangeQuery } from '../api/planning.api';
import type {
  CreatePlannedSessionPayload,
  StartPlannedSessionPayload,
  UpdatePlannedSessionPayload,
} from '../types';

/**
 * Keyed by the range and not by the month, because the range IS what was
 * fetched: two months whose grids overlap must not read each other's cache.
 */
export const plannedSessionsQueryKey = (studyspaceId: number, range: RangeQuery) =>
  ['planned-sessions', studyspaceId, range.from, range.to] as const;

export const usePlannedSessions = (studyspaceId: number, range: RangeQuery) =>
  useQuery({
    queryKey: plannedSessionsQueryKey(studyspaceId, range),
    queryFn: () => planningApi.list(studyspaceId, range),
    enabled: Number.isFinite(studyspaceId),
    // Paging back to a month you just looked at should not blank the grid.
    placeholderData: (previous) => previous,
  });

/**
 * Every calendar write invalidates every range of this studyspace.
 *
 * Broad on purpose: moving a block from March to April changes two grids, and
 * working out which ones from the payload would be a cache invalidation bug
 * waiting for the first cross-month reschedule.
 */
const usePlanningInvalidation = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: ['planned-sessions', studyspaceId] });
  };
};

export const useCreatePlannedSession = (studyspaceId: number) => {
  const invalidate = usePlanningInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (payload: CreatePlannedSessionPayload) => planningApi.create(payload),
    onSuccess: invalidate,
  });
};

export const useUpdatePlannedSession = (studyspaceId: number) => {
  const invalidate = usePlanningInvalidation(studyspaceId);

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: UpdatePlannedSessionPayload }) =>
      planningApi.update(id, payload),
    onSuccess: invalidate,
  });
};

export const useCancelPlannedSession = (studyspaceId: number) => {
  const invalidate = usePlanningInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (id: number) => planningApi.cancel(id),
    onSuccess: invalidate,
  });
};

export const useDeletePlannedSession = (studyspaceId: number) => {
  const invalidate = usePlanningInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (id: number) => planningApi.remove(id),
    onSuccess: invalidate,
  });
};

/**
 * Turns a planned block into a running session.
 *
 * Seeds the running-session cache as well as its own: the user is about to
 * land on the studyspace with a timer open, and a refetch round trip in
 * between would show them an empty panel first.
 */
export const useStartPlannedSession = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  const invalidate = usePlanningInvalidation(studyspaceId);

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: StartPlannedSessionPayload }) =>
      planningApi.start(id, payload),
    onSuccess: (session) => {
      queryClient.setQueryData(activeSessionQueryKey(studyspaceId), session);
      queryClient.invalidateQueries({ queryKey: ['study-sessions', studyspaceId] });
      invalidate();
    },
  });
};
