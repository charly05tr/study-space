import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { sessionsApi } from '../api/sessions.api';
import type { StartSessionPayload, StudySession } from '../types';

export const sessionsQueryKey = (studyspaceId: number, page: number) =>
  ['study-sessions', studyspaceId, page] as const;

export const activeSessionQueryKey = (studyspaceId: number) =>
  ['study-session-active', studyspaceId] as const;

export const useSessionHistory = (studyspaceId: number, page = 1) =>
  useQuery({
    queryKey: sessionsQueryKey(studyspaceId, page),
    queryFn: () => sessionsApi.list(studyspaceId, page),
    enabled: Number.isFinite(studyspaceId),
  });

/**
 * The session left running in this studyspace, if any.
 *
 * Read on every open rather than kept in the browser: the record is the
 * server's, so a session started on a laptop is still there on a phone. The
 * timer's own position is the only part that lives locally — see
 * pomodoroStore.
 */
export const useActiveSession = (studyspaceId: number) =>
  useQuery({
    queryKey: activeSessionQueryKey(studyspaceId),
    queryFn: () => sessionsApi.active(studyspaceId),
    enabled: Number.isFinite(studyspaceId),
  });

/** Everything a session write invalidates: the open one, and the history. */
const useSessionInvalidation = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  return () => {
    queryClient.invalidateQueries({ queryKey: activeSessionQueryKey(studyspaceId) });
    queryClient.invalidateQueries({ queryKey: ['study-sessions', studyspaceId] });
  };
};

export const useStartSession = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  const invalidate = useSessionInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (payload: StartSessionPayload) => sessionsApi.start(payload),
    onSuccess: (session) => {
      // Seeded rather than only invalidated: the panel renders from this the
      // moment the mutation resolves, and a refetch round trip would show an
      // empty timer in between.
      queryClient.setQueryData(activeSessionQueryKey(studyspaceId), session);
      invalidate();
    },
  });
};

export const useCompletePomodoro = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  const invalidate = useSessionInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (sessionId: number) => sessionsApi.completePomodoro(sessionId),
    onSuccess: (session) => {
      queryClient.setQueryData(activeSessionQueryKey(studyspaceId), session);
      invalidate();
    },
  });
};

export const useFinishSession = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  const invalidate = useSessionInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (sessionId: number) => sessionsApi.finish(sessionId),
    onSuccess: () => {
      // Null, not the finished session: "the open one" is now nothing, and
      // leaving the closed record here would keep the panel on screen.
      queryClient.setQueryData<StudySession | null>(activeSessionQueryKey(studyspaceId), null);
      invalidate();
    },
  });
};

export const useDiscardSession = (studyspaceId: number) => {
  const queryClient = useQueryClient();
  const invalidate = useSessionInvalidation(studyspaceId);

  return useMutation({
    mutationFn: (sessionId: number) => sessionsApi.discard(sessionId),
    onSuccess: () => {
      queryClient.setQueryData<StudySession | null>(activeSessionQueryKey(studyspaceId), null);
      invalidate();
    },
  });
};
