import { useCallback, useEffect, useRef } from 'react';
import { readerApi } from '../api/reader.api';

const DEBOUNCE_MS = 1500;

/**
 * Persists reading position without a request per scroll event.
 *
 * Deliberately not a react-query mutation: this fires constantly, must not
 * surface errors to the reader, and must survive the component unmounting
 * mid-flight (leaving a page is exactly when the last position matters most).
 */
export const useSaveProgress = (sourceId: number) => {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<string | null>(null);
  const lastSaved = useRef<string | null>(null);

  const flush = useCallback(() => {
    const anchor = pending.current;
    if (!anchor || anchor === lastSaved.current) return;
    lastSaved.current = anchor;
    pending.current = null;
    // Fire and forget: a lost progress ping is not worth interrupting reading.
    readerApi.saveProgress(sourceId, { last_anchor: anchor }).catch(() => {});
  }, [sourceId]);

  const save = useCallback(
    (anchor: string) => {
      pending.current = anchor;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, DEBOUNCE_MS);
    },
    [flush],
  );

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
      flush();
    };
  }, [flush]);

  return save;
};
