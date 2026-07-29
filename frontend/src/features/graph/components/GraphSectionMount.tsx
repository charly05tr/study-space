import { Suspense, lazy, useEffect, useRef, useState } from 'react';

/**
 * Loaded only once the section is actually reached.
 *
 * Two costs are being deferred here, and both are real. The renderer is a
 * megabyte of JavaScript, and mounting the canvas opens a WebGL context — on a
 * page most visits scroll halfway down and leave. An IntersectionObserver keeps
 * the section automatic, the way the rest of the page is, while charging
 * nothing to anyone who never gets there.
 */
const GraphSection = lazy(() =>
  import('./GraphSection').then((module) => ({ default: module.GraphSection })),
);

interface GraphSectionMountProps {
  studyspaceId: number;
}

export const GraphSectionMount = ({ studyspaceId }: GraphSectionMountProps) => {
  const anchor = useRef<HTMLDivElement>(null);
  const [reached, setReached] = useState(false);

  useEffect(() => {
    const element = anchor.current;
    if (!element || reached) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        setReached(true);
        observer.disconnect();
      },
      // A little ahead of the fold, so the chunk is on its way before the
      // section is on screen rather than after.
      { rootMargin: '300px' },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [reached]);

  return (
    <div ref={anchor}>
      {reached ? (
        <Suspense fallback={<p className="px-1 py-6 text-sm text-muted">Loading the map…</p>}>
          <GraphSection studyspaceId={studyspaceId} />
        </Suspense>
      ) : (
        // Holds roughly the height the map will take, so arriving at the section
        // does not shove the rest of the page down.
        <div className="h-[55vh] min-h-80 rounded-xs border border-dashed border-rule/60" />
      )}
    </div>
  );
};
