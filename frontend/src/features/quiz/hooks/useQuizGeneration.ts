import { useQuizRunsStore } from '../store/quizRunsStore';

/**
 * The page's view of the background generation for one studyspace. The run
 * itself lives in `quizRunsStore`, so leaving the page does not cancel it.
 */
export const useQuizGeneration = (studyspaceId: number) => {
  const run = useQuizRunsStore((state) => state.runs[studyspaceId]) ?? null;
  const start = useQuizRunsStore((state) => state.start);
  const cancel = useQuizRunsStore((state) => state.cancel);
  const dismiss = useQuizRunsStore((state) => state.dismiss);
  const retrySave = useQuizRunsStore((state) => state.retrySave);

  return { run, start, cancel, dismiss, retrySave };
};
