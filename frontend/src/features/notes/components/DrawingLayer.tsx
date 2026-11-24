import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react';
import { Button } from '../../../components/ui';
import { cn } from '../../../components/ui/cn';
import {
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  PEN_COLORS,
  PEN_WIDTHS,
  appendPoint,
  canAddStroke,
  clampCoordinate,
  eraseAt,
  growHeight,
  strokeToPath,
  type NoteDrawing,
  type Stroke,
  type StrokePoint,
} from '../drawing';

type Tool = 'pen' | 'eraser';

const ERASER_RADIUS = 10;
/** Past this distance from the viewport bottom the page follows the pen down. */
const SCROLL_EDGE = 60;
const SCROLL_STEP = 14;
const MAX_HISTORY = 50;

// Inline SVG cursors, hotspot at the tip. They fall back to a built-in cursor
// where data-URI cursors are unsupported.
const PEN_CURSOR =
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
  `<path d='M3 21l1-5L16 4l4 4L8 20z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/></svg>") 3 21, crosshair`;
const ERASER_CURSOR =
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'>` +
  `<circle cx='11' cy='11' r='9' fill='none' stroke='black' stroke-width='1.5'/></svg>") 11 11, cell`;

const newStrokeId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * Committed strokes are memoized: while a stroke is being drawn only the live
 * path changes, so the (potentially thousands of) finished paths are not
 * re-rendered on every animation frame.
 */
const StrokePaths = memo(({ strokes }: { strokes: Stroke[] }) => (
  <>
    {strokes.map((stroke) => (
      <path
        key={stroke.id}
        d={strokeToPath(stroke.points)}
        fill="none"
        stroke={stroke.color}
        strokeWidth={stroke.width}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ))}
  </>
));
StrokePaths.displayName = 'StrokePaths';

interface DrawingLayerProps {
  /** Seeded once; the layer owns the strokes afterwards. */
  initialDrawing: NoteDrawing;
  /** Pen mode. Off: strokes are shown but the pointer passes through to the text. */
  active: boolean;
  onExit: () => void;
  /** Called once per finished gesture (stroke, erase, undo, clear), never per move. */
  onChange: (drawing: NoteDrawing) => void;
  /** The editor. The layer wraps it so both share one box, width and scroll. */
  children: ReactNode;
}

/**
 * A transparent SVG laid over the editor.
 *
 * The wrapper's min-height is what makes the note grow: when the pen nears the
 * bottom edge the min-height is raised, the note itself gets taller, and the
 * overlay (inset-0) follows. The height is persisted so the extra space survives
 * a reload. See drawing.ts for the anchoring tradeoff.
 */
export const DrawingLayer = ({
  initialDrawing,
  active,
  onExit,
  onChange,
  children,
}: DrawingLayerProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  const [strokes, setStrokes] = useState<Stroke[]>(initialDrawing.strokes);
  const [height, setHeight] = useState<number | null>(initialDrawing.height);
  const [liveD, setLiveD] = useState<string | null>(null);
  const [tool, setTool] = useState<Tool>('pen');
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);

  // Handlers read these instead of state: pointer events arrive faster than
  // React re-renders, and a stale closure would drop points.
  const strokesRef = useRef(strokes);
  const heightRef = useRef(initialDrawing.height);
  const liveRef = useRef<StrokePoint[] | null>(null);
  const erasingRef = useRef<{ before: Stroke[]; changed: boolean } | null>(null);
  const historyRef = useRef<Stroke[][]>([]);
  const frameRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const settingsRef = useRef({ tool, color, width });
  useEffect(() => {
    onChangeRef.current = onChange;
    settingsRef.current = { tool, color, width };
  });

  /** Single write path, so history and persistence cannot drift apart. */
  const commit = useCallback((next: Stroke[], previous?: Stroke[]) => {
    if (previous) {
      historyRef.current = [...historyRef.current, previous].slice(-MAX_HISTORY);
    }
    strokesRef.current = next;
    setStrokes(next);
    onChangeRef.current({ version: 1, height: heightRef.current, strokes: next });
  }, []);

  const undo = useCallback(() => {
    const previous = historyRef.current[historyRef.current.length - 1];
    if (!previous || liveRef.current) return;
    historyRef.current = historyRef.current.slice(0, -1);
    commit(previous);
  }, [commit]);

  const clear = useCallback(() => {
    if (strokesRef.current.length === 0) return;
    commit([], strokesRef.current);
  }, [commit]);

  /** Batches pointer samples into one render per animation frame. */
  const scheduleLiveRender = useCallback(() => {
    if (frameRef.current !== null) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = null;
      setLiveD(liveRef.current ? strokeToPath(liveRef.current) : null);
    });
  }, []);

  // Leaving pen mode mid-gesture must not leave a half-drawn stroke on screen.
  useEffect(() => {
    if (active) return;
    liveRef.current = null;
    erasingRef.current = null;
    // Through the same rAF path as drawing: the frame callback reads the now
    // empty liveRef and clears the preview (and it is not a synchronous
    // setState in an effect).
    scheduleLiveRender();
  }, [active, scheduleLiveRender]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // Capture phase on window so Ctrl+Z reaches us before ProseMirror's history:
  // in pen mode it must undo strokes, not text.
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onExit();
        return;
      }
      if ((event.ctrlKey || event.metaKey) && !event.shiftKey && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        event.stopPropagation();
        undo();
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [active, onExit, undo]);

  const eraseHere = (x: number, y: number) => {
    const session = erasingRef.current;
    if (!session) return;
    const next = eraseAt(strokesRef.current, x, y, ERASER_RADIUS);
    if (next === strokesRef.current) return;
    session.changed = true;
    // Rendered right away but only persisted when the gesture ends.
    strokesRef.current = next;
    setStrokes(next);
  };

  const growIfNeeded = (y: number, rectHeight: number) => {
    const current = Math.max(rectHeight, heightRef.current ?? 0);
    const next = growHeight(y, current);
    if (next === current) return;
    heightRef.current = next;
    setHeight(next);
  };

  const onPointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!active || !wrapRef.current) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;

    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);

    const rect = wrapRef.current.getBoundingClientRect();
    const x = clampCoordinate(event.clientX - rect.left);
    const y = clampCoordinate(event.clientY - rect.top);

    if (settingsRef.current.tool === 'eraser') {
      erasingRef.current = { before: strokesRef.current, changed: false };
      eraseHere(x, y);
      return;
    }

    liveRef.current = appendPoint([], x, y);
    scheduleLiveRender();
  };

  const onPointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (!active || !wrapRef.current) return;
    if (!liveRef.current && !erasingRef.current) return;

    const rect = wrapRef.current.getBoundingClientRect();
    // Coalesced events are the samples the browser merged into this one; using
    // them keeps fast strokes from turning into straight chords.
    const samples = event.nativeEvent.getCoalescedEvents?.();
    const events = samples && samples.length > 0 ? samples : [event.nativeEvent];

    for (const sample of events) {
      const x = clampCoordinate(sample.clientX - rect.left);
      const y = clampCoordinate(sample.clientY - rect.top);

      if (erasingRef.current) {
        eraseHere(x, y);
      } else if (liveRef.current) {
        liveRef.current = appendPoint(liveRef.current, x, y);
        growIfNeeded(y, rect.height);
      }
    }

    if (liveRef.current) {
      scheduleLiveRender();
      // Keeps the page following the pen so the user can reach the new space.
      if (event.clientY > window.innerHeight - SCROLL_EDGE) window.scrollBy(0, SCROLL_STEP);
    }
  };

  const finishGesture = () => {
    const erasing = erasingRef.current;
    if (erasing) {
      erasingRef.current = null;
      if (erasing.changed) commit(strokesRef.current, erasing.before);
      return;
    }

    const points = liveRef.current;
    liveRef.current = null;
    setLiveD(null);
    if (!points) return;

    // Past the backend's bounds the stroke is dropped: persisting it would make
    // the whole save fail and take every later stroke down with it.
    if (!canAddStroke(strokesRef.current, points.length)) return;

    const { color: penColor, width: penWidth } = settingsRef.current;
    commit(
      [...strokesRef.current, { id: newStrokeId(), color: penColor, width: penWidth, points }],
      strokesRef.current,
    );
  };

  const cursor = tool === 'eraser' ? ERASER_CURSOR : PEN_CURSOR;
  const svgStyle: CSSProperties = active ? { cursor, touchAction: 'none' } : {};

  return (
    <div ref={wrapRef} className="relative" style={{ minHeight: height ?? undefined }}>
      {children}

      <svg
        role="img"
        aria-label="Drawing over the note"
        className={cn(
          'absolute left-0 top-0 z-[5] h-full w-full overflow-visible',
          active ? 'pointer-events-auto' : 'pointer-events-none',
        )}
        style={svgStyle}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finishGesture}
        onPointerCancel={finishGesture}
      >
        <StrokePaths strokes={strokes} />
        {liveD && (
          <path
            d={liveD}
            fill="none"
            stroke={color}
            strokeWidth={width}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        )}
      </svg>

      {active && (
        <div
          role="toolbar"
          aria-label="Drawing tools"
          className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xs border border-rule bg-page px-3 py-2 shadow-sm"
        >
          <Button
            size="sm"
            variant={tool === 'pen' ? 'secondary' : 'quiet'}
            aria-pressed={tool === 'pen'}
            onClick={() => setTool('pen')}
          >
            Pen
          </Button>
          <Button
            size="sm"
            variant={tool === 'eraser' ? 'secondary' : 'quiet'}
            aria-pressed={tool === 'eraser'}
            onClick={() => setTool('eraser')}
          >
            Eraser
          </Button>

          <span className="mx-1 h-5 w-px bg-rule" aria-hidden />

          {PEN_COLORS.map((swatch) => (
            <button
              key={swatch}
              type="button"
              aria-label={`Color ${swatch.replace('var(--color-', '').replace(')', '')}`}
              aria-pressed={color === swatch}
              onClick={() => {
                setColor(swatch);
                setTool('pen');
              }}
              className={cn(
                'h-5 w-5 rounded-full border-2',
                color === swatch ? 'border-ink ring-2 ring-primary' : 'border-rule',
              )}
              style={{ backgroundColor: swatch }}
            />
          ))}

          <span className="mx-1 h-5 w-px bg-rule" aria-hidden />

          {PEN_WIDTHS.map((size) => (
            <button
              key={size}
              type="button"
              aria-label={`Width ${size}`}
              aria-pressed={width === size}
              onClick={() => {
                setWidth(size);
                setTool('pen');
              }}
              className={cn(
                'flex h-6 w-6 items-center justify-center rounded-xs border',
                width === size ? 'border-ink bg-tint' : 'border-transparent hover:border-rule',
              )}
            >
              <span className="rounded-full bg-ink" style={{ width: size + 2, height: size + 2 }} />
            </button>
          ))}

          <span className="mx-1 h-5 w-px bg-rule" aria-hidden />

          <Button size="sm" variant="quiet" onClick={undo}>
            Undo
          </Button>
          <Button size="sm" variant="quiet" onClick={clear}>
            Clear
          </Button>
          <Button size="sm" variant="primary" onClick={onExit}>
            Done
          </Button>
        </div>
      )}
    </div>
  );
};
