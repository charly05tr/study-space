import { useReviewRunsStore } from '../store/reviewRunsStore';

/**
 * The panel's view of the background run for one note. The run itself lives in
 * `reviewRunsStore`, so closing the panel or leaving the note does not cancel it.
 */
export const useWritingReview = (noteId: number) => {
  const run = useReviewRunsStore((state) => state.runs[noteId]) ?? null;
  const start = useReviewRunsStore((state) => state.start);
  const cancel = useReviewRunsStore((state) => state.cancel);
  const dismiss = useReviewRunsStore((state) => state.dismiss);
  const retrySave = useReviewRunsStore((state) => state.retrySave);

  return { run, start, cancel, dismiss, retrySave };
};
