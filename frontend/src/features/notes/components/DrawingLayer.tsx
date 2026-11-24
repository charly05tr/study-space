import {
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "../../../components/ui";
import { cn } from "../../../components/ui/cn";
import {
  IDENTITY_CAMERA,
  cameraTransform,
  panBy,
  wheelDeltaPixels,
  wheelZoomFactor,
  zoomAt,
  zoomPercent,
  type Camera,
} from "../camera";
import {
  DEFAULT_COLOR,
  DEFAULT_WIDTH,
  MIN_POINT_DISTANCE,
  PEN_COLORS,
  PEN_WIDTHS,
  appendPoint,
  canAddStroke,
  clampCoordinate,
  eraseAt,
  requiredHeight,
  roundCoordinate,
  strokeToPath,
  type NoteDrawing,
  type Stroke,
  type StrokePoint,
} from "../drawing";
import {
  MIN_SHAPE_SIZE,
  arrowHeadPath,
  boxOf,
  constrainShape,
  isDegenerateShape,
  isShapeType,
  type ShapeType,
  type StrokeType,
} from "../shapes";
import { DEFAULT_SHAPE, toolForKey, type Tool } from "../drawingTools";
import { ShapeMenu } from "./ShapeMenu";

/** Eraser reach in SCREEN px; divided by the zoom to get world units. */
const ERASER_RADIUS = 10;
const MAX_HISTORY = 50;

// Inline SVG cursors, hotspot at the tip. They fall back to a built-in cursor
// where data-URI cursors are unsupported.
const PEN_CURSOR =
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='24' height='24' viewBox='0 0 24 24'>` +
  `<path d='M3 21l1-5L16 4l4 4L8 20z' fill='white' stroke='black' stroke-width='1.5' stroke-linejoin='round'/></svg>") 3 21, crosshair`;
const ERASER_CURSOR =
  `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='22' height='22' viewBox='0 0 22 22'>` +
  `<circle cx='11' cy='11' r='9' fill='none' stroke='black' stroke-width='1.5'/></svg>") 11 11, cell`;

/** A shift-constrained end point can land outside the backend's bounds. */
const clampPoint = ([x, y]: StrokePoint): StrokePoint => [
  clampCoordinate(x),
  clampCoordinate(y),
];

const newStrokeId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
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
      <StrokeShape key={stroke.id} stroke={stroke} />
    ))}
  </>
));
StrokePaths.displayName = "StrokePaths";

/**
 * One stroke or shape as SVG. Shapes are unfilled outlines drawn with the same
 * stroke colour and width as freehand, so they adapt to the theme the same way;
 * smoothing applies to freehand only.
 */
const StrokeShape = ({
  stroke,
}: {
  stroke: Pick<Stroke, "type" | "color" | "width" | "points">;
}) => {
  const common = {
    fill: "none",
    stroke: stroke.color,
    strokeWidth: stroke.width,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const { type, points } = stroke;

  if (isShapeType(type) && points.length === 2) {
    const [a, b] = points;
    if (type === "rect") {
      const box = boxOf(a, b);
      return <rect {...box} {...common} />;
    }
    if (type === "ellipse") {
      const box = boxOf(a, b);
      return (
        <ellipse
          cx={box.x + box.width / 2}
          cy={box.y + box.height / 2}
          rx={box.width / 2}
          ry={box.height / 2}
          {...common}
        />
      );
    }
    return (
      <>
        <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} {...common} />
        {type === "arrow" && (
          <path d={arrowHeadPath(a, b, stroke.width)} {...common} />
        )}
      </>
    );
  }

  return <path d={strokeToPath(points)} {...common} />;
};

const isMenuItem = (target: EventTarget | null) =>
  target instanceof Element && target.closest("[role^='menuitem']") !== null;

/** What is being drawn right now: freehand samples, or a shape's two points. */
interface LiveStroke {
  type: StrokeType;
  points: StrokePoint[];
}

/** Inline styles the world element gets while drawing, restored on exit. */
const WORLD_STYLE_KEYS = [
  "transform",
  "transformOrigin",
  "willChange",
  "position",
  "zIndex",
] as const;

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
 * The drawing layer over a note.
 *
 * Normal mode: the strokes are an SVG over the editor, clipped to the text
 * column (what lies outside it is not shown), and the wrapper is at least as
 * tall as the lowest stroke so drawings below the text stay visible.
 *
 * Draw mode: the whole note page (the nearest <article>: title, column and
 * strokes) becomes a "world" moved by a CSS transform, over an opaque backdrop
 * that hides the rest of the app. A full-viewport transparent layer captures
 * the pointer, so strokes can go anywhere, above or beside the note. Panning
 * and zooming only touch that transform (through refs and rAF, no React render
 * per frame); stored coordinates stay in world units relative to the column's
 * top-left, so drawings made before this existed render in the same place.
 *
 * Tradeoff: the text is a DOM element scaled by `transform`, so at a zoom other
 * than 100% it can look slightly blurry. See drawing.ts for the anchoring
 * tradeoff (strokes do not follow text reflow).
 */
export const DrawingLayer = ({
  initialDrawing,
  active,
  onExit,
  onChange,
  children,
}: DrawingLayerProps) => {
  const wrapRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  const [strokes, setStrokes] = useState<Stroke[]>(initialDrawing.strokes);
  // Derived so strokes saved below the text stay visible in normal mode, even for
  // drawings saved before this rule existed.
  const initialHeight =
    Math.max(initialDrawing.height ?? 0, requiredHeight(initialDrawing.strokes)) ||
    null;
  const [height, setHeight] = useState<number | null>(initialHeight);
  const [live, setLive] = useState<LiveStroke | null>(null);
  const [tool, setTool] = useState<Tool>("pen");
  // Remembered separately from `tool`: the shapes button keeps showing the last
  // shape even while the pen or eraser is active.
  const [lastShape, setLastShape] = useState<ShapeType>(DEFAULT_SHAPE);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const shapeMenuOpenRef = useRef(false);
  const [color, setColor] = useState<string>(DEFAULT_COLOR);
  const [width, setWidth] = useState<number>(DEFAULT_WIDTH);
  const [zoomLabel, setZoomLabel] = useState(100);
  const [spaceHeld, setSpaceHeld] = useState(false);

  // Handlers read these instead of state: pointer events arrive faster than
  // React re-renders, and a stale closure would drop points.
  const strokesRef = useRef(strokes);
  const heightRef = useRef(initialHeight);
  // Legacy: the surface no longer grows sideways, but older drawings carry a
  // width and it is written back untouched.
  const widthRef = useRef(initialDrawing.width);
  const liveRef = useRef<LiveStroke | null>(null);
  /** Where a shape drag began; the live shape is always start -> constrained pointer. */
  const shapeStartRef = useRef<StrokePoint | null>(null);
  const erasingRef = useRef<{ before: Stroke[]; changed: boolean } | null>(
    null,
  );
  const historyRef = useRef<Stroke[][]>([]);
  const frameRef = useRef<number | null>(null);
  const onChangeRef = useRef(onChange);
  const settingsRef = useRef({ tool, color, width });
  const spaceRef = useRef(false);

  // Camera, kept out of React state: it changes every frame while panning.
  const camRef = useRef<Camera>(IDENTITY_CAMERA);
  /** The camera as last written to the DOM (the live one may be a frame ahead). */
  const appliedCamRef = useRef<Camera>(IDENTITY_CAMERA);
  /** True once the component is unmounting, as opposed to just leaving draw mode. */
  const unmountedRef = useRef(false);
  const worldRef = useRef<HTMLElement | null>(null);
  const camFrameRef = useRef<number | null>(null);
  const panRef = useRef<{ x: number; y: number; camera: Camera } | null>(null);

  useEffect(() => {
    onChangeRef.current = onChange;
    shapeMenuOpenRef.current = shapeMenuOpen;
    settingsRef.current = { tool, color, width };
    spaceRef.current = spaceHeld;
  });

  /** Single write path, so history and persistence cannot drift apart. */
  const commit = useCallback((next: Stroke[], previous?: Stroke[]) => {
    if (previous) {
      historyRef.current = [...historyRef.current, previous].slice(
        -MAX_HISTORY,
      );
    }
    strokesRef.current = next;
    setStrokes(next);

    // Keeps strokes below the text visible in normal mode. Grows only: erasing
    // or undoing must not make the page shorter under the reader.
    const needed = requiredHeight(next);
    if (needed > (heightRef.current ?? 0)) {
      heightRef.current = needed;
      setHeight(needed);
    }

    onChangeRef.current({
      version: 1,
      height: heightRef.current,
      width: widthRef.current,
      strokes: next,
    });
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
      // A fresh object each frame, so React sees a change even when only the
      // (immutably replaced) points moved.
      setLive(liveRef.current ? { ...liveRef.current } : null);
    });
  }, []);

  /** Writes the camera into the world's transform, at most once per frame. */
  const applyCamera = useCallback(() => {
    if (camFrameRef.current !== null) return;
    camFrameRef.current = requestAnimationFrame(() => {
      camFrameRef.current = null;
      if (worldRef.current) {
        worldRef.current.style.transform = cameraTransform(camRef.current);
        appliedCamRef.current = camRef.current;
      }
    });
  }, []);

  const resetView = useCallback(() => {
    camRef.current = IDENTITY_CAMERA;
    applyCamera();
    setZoomLabel(100);
  }, [applyCamera]);

  // Leaving pen mode mid-gesture must not leave a half-drawn stroke on screen.
  useEffect(() => {
    if (active) return;
    liveRef.current = null;
    // An erase cut short by Esc or Done has already changed what is on screen,
    // so it is committed (history and save) instead of silently dropped.
    const erasing = erasingRef.current;
    erasingRef.current = null;
    if (erasing?.changed) commit(strokesRef.current, erasing.before);
    panRef.current = null;
    // Through the same rAF path as drawing: the frame callback reads the now
    // empty liveRef and clears the preview (and it is not a synchronous
    // setState in an effect).
    scheduleLiveRender();
  }, [active, scheduleLiveRender, commit]);

  useEffect(
    () => () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    },
    [],
  );

  // Declared before the effect below on purpose: cleanups run in declaration
  // order, so on unmount this flag is already set when that cleanup reads it.
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
    };
  }, []);

  // Entering draw mode turns the note page into the world and freezes the page
  // scroll; leaving (or unmounting, e.g. navigating away) puts everything back.
  useEffect(() => {
    if (!active) return;
    const wrap = wrapRef.current;
    if (!wrap) return;

    const world = wrap.closest("article") ?? wrap;
    const html = document.documentElement;

    const savedWorld = WORLD_STYLE_KEYS.map(
      (key) => [key, world.style[key]] as const,
    );
    const savedOverflow = html.style.overflow;
    const savedGutter = html.style.scrollbarGutter;
    const { scrollX, scrollY } = window;

    // Overflow hidden freezes the scroll position where it is, so the note does
    // not move when entering: no scroll compensation is needed. If a classic
    // scrollbar was showing, its gutter is kept (blank) so the centred column
    // does not shift sideways by the scrollbar's width.
    const hadScrollbar = window.innerWidth > html.clientWidth;
    html.style.overflow = "hidden";
    if (hadScrollbar) html.style.scrollbarGutter = "stable";

    world.style.transformOrigin = "0 0";
    world.style.willChange = "transform";
    // Above the backdrop (z-8) and below the pointer layer (z-10).
    world.style.position = "relative";
    world.style.zIndex = "9";
    worldRef.current = world;
    camRef.current = IDENTITY_CAMERA;

    appliedCamRef.current = IDENTITY_CAMERA;

    return () => {
      if (camFrameRef.current !== null) {
        cancelAnimationFrame(camFrameRef.current);
        camFrameRef.current = null;
      }
      for (const [key, value] of savedWorld) world.style[key] = value;
      worldRef.current = null;
      html.style.overflow = savedOverflow;
      html.style.scrollbarGutter = savedGutter;
      // Only when drawing stops while the note stays on screen. On unmount
      // (navigating away) the incoming page owns the scroll position.
      if (!unmountedRef.current) window.scrollTo(scrollX, scrollY);
      camRef.current = IDENTITY_CAMERA;
      setZoomLabel(100);
    };
  }, [active]);

  // Wheel zooms toward the cursor. A native, non-passive listener: React's
  // onWheel is passive, so it could not stop the page from scrolling.
  useEffect(() => {
    if (!active) return;
    const layer = layerRef.current;
    if (!layer) return;

    // Measured when needed, not cached: the world's untransformed corner moves
    // if the layout shifts (window resize, a taller note). Subtracting the camera
    // as last applied keeps it right even with a frame still pending.
    const measureOrigin = () => {
      const rect = (worldRef.current ?? layer).getBoundingClientRect();
      return {
        x: rect.left - appliedCamRef.current.x,
        y: rect.top - appliedCamRef.current.y,
      };
    };

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      // Zooming under a pan or a stroke in progress would mix zoom levels within
      // one gesture (and the pan keeps a snapshot of the old camera).
      if (panRef.current || liveRef.current || erasingRef.current) return;
      const origin = measureOrigin();
      // Trackpad pinch arrives as ctrl+wheel.
      const factor = wheelZoomFactor(wheelDeltaPixels(event), event.ctrlKey);
      const next = zoomAt(camRef.current, factor, {
        x: event.clientX - origin.x,
        y: event.clientY - origin.y,
      });
      if (next === camRef.current) return;
      camRef.current = next;
      applyCamera();
      setZoomLabel(zoomPercent(next));
    };

    layer.addEventListener("wheel", onWheel, { passive: false });
    return () => layer.removeEventListener("wheel", onWheel);
  }, [active, applyCamera]);

  /** Every way of picking a tool goes through here so the shapes button stays in sync. */
  const selectTool = useCallback((next: Tool) => {
    setTool(next);
    if (isShapeType(next)) setLastShape(next);
    setShapeMenuOpen(false);
  }, []);

  // Capture phase on window so Ctrl+Z reaches us before ProseMirror's history:
  // in pen mode it must undo strokes, not text.
  useEffect(() => {
    if (!active) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        // Handled here and nowhere else: without stopping it, one Esc would also
        // reach other Esc handlers (e.g. the review panel's) and close them too.
        event.preventDefault();
        event.stopPropagation();
        // With the shapes dropdown open, Esc closes only the dropdown.
        if (shapeMenuOpenRef.current) {
          setShapeMenuOpen(false);
          return;
        }
        onExit();
        return;
      }
      if (
        (event.ctrlKey || event.metaKey) &&
        !event.shiftKey &&
        event.key.toLowerCase() === "z"
      ) {
        event.preventDefault();
        event.stopPropagation();
        undo();
        return;
      }

      // Single-key tool shortcuts. Never while typing in a field, never with a
      // modifier (Ctrl+R must still reload), and swallowed so the key cannot
      // reach ProseMirror.
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      // The target can be the window or document (no `closest`), e.g. for a
      // synthetic event, so it is checked before use.
      const target = event.target;
      if (
        target instanceof Element &&
        target.closest("input, textarea, select, [contenteditable='true']")
      )
        return;

      // Space held = temporary hand tool. Only menu items keep Space (it selects
      // them). On a focused toolbar button it must pan instead, or releasing it
      // would activate the button a second time.
      if (event.key === " ") {
        if (isMenuItem(target)) return;
        event.preventDefault();
        event.stopPropagation();
        setSpaceHeld(true);
        return;
      }

      if (event.key === "0") {
        event.preventDefault();
        event.stopPropagation();
        resetView();
        return;
      }

      const match = toolForKey(event.key);
      if (!match) return;
      event.preventDefault();
      event.stopPropagation();
      selectTool(match.tool);
    };

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key !== " ") return;
      setSpaceHeld(false);
      // Buttons activate on the keyup of Space; swallow it like the keydown.
      const target = event.target;
      if (
        !isMenuItem(target) &&
        !(
          target instanceof Element &&
          target.closest("input, textarea, select, [contenteditable='true']")
        )
      ) {
        event.preventDefault();
        event.stopPropagation();
      }
    };
    const releaseSpace = () => setSpaceHeld(false);

    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("keyup", onKeyUp, true);
    window.addEventListener("blur", releaseSpace);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("keyup", onKeyUp, true);
      window.removeEventListener("blur", releaseSpace);
      setSpaceHeld(false);
    };
  }, [active, onExit, undo, selectTool, resetView]);

  const eraseHere = (x: number, y: number) => {
    const session = erasingRef.current;
    if (!session) return;
    // The eraser's reach is constant on screen, so it shrinks in world units
    // when zoomed in.
    const next = eraseAt(
      strokesRef.current,
      x,
      y,
      ERASER_RADIUS / camRef.current.zoom,
    );
    if (next === strokesRef.current) return;
    session.changed = true;
    // Rendered right away but only persisted when the gesture ends.
    strokesRef.current = next;
    setStrokes(next);
  };

  const cursor =
    tool === "hand" || spaceHeld
      ? "grab"
      : tool === "eraser"
        ? ERASER_CURSOR
        : isShapeType(tool)
          ? "crosshair"
          : PEN_CURSOR;

  /** Screen -> world through the inverse camera, relative to the column's top-left. */
  const toWorld = (clientX: number, clientY: number, rect: DOMRect) => {
    const { zoom } = camRef.current;
    return {
      x: clampCoordinate((clientX - rect.left) / zoom),
      y: clampCoordinate((clientY - rect.top) / zoom),
    };
  };

  const onPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || !wrapRef.current) return;
    const middle = event.pointerType === "mouse" && event.button === 1;
    if (event.pointerType === "mouse" && event.button !== 0 && !middle) return;

    event.preventDefault();
    setShapeMenuOpen(false);
    // A toolbar button may still hold focus; Space or Enter would re-trigger it.
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    event.currentTarget.setPointerCapture(event.pointerId);

    // Pan: the hand tool, Space held, or the middle button, whatever tool is on.
    if (middle || spaceRef.current || settingsRef.current.tool === "hand") {
      panRef.current = {
        x: event.clientX,
        y: event.clientY,
        camera: camRef.current,
      };
      event.currentTarget.style.cursor = "grabbing";
      return;
    }

    // The wrapper's rect already includes the camera transform, so dividing by
    // the zoom is all the inverse camera takes.
    const rect = wrapRef.current.getBoundingClientRect();
    const { x, y } = toWorld(event.clientX, event.clientY, rect);

    if (settingsRef.current.tool === "eraser") {
      erasingRef.current = { before: strokesRef.current, changed: false };
      eraseHere(x, y);
      return;
    }

    const { tool: current } = settingsRef.current;
    if (isShapeType(current)) {
      shapeStartRef.current = [roundCoordinate(x), roundCoordinate(y)];
      liveRef.current = {
        type: current,
        points: [shapeStartRef.current, shapeStartRef.current],
      };
    } else {
      shapeStartRef.current = null;
      liveRef.current = { type: "free", points: appendPoint([], x, y) };
    }
    scheduleLiveRender();
  };

  const onPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!active || !wrapRef.current) return;

    const pan = panRef.current;
    if (pan) {
      camRef.current = panBy(
        pan.camera,
        event.clientX - pan.x,
        event.clientY - pan.y,
      );
      applyCamera();
      return;
    }

    if (!liveRef.current && !erasingRef.current) return;

    const rect = wrapRef.current.getBoundingClientRect();
    const { zoom } = camRef.current;
    // Coalesced events are the samples the browser merged into this one; using
    // them keeps fast strokes from turning into straight chords.
    const samples = event.nativeEvent.getCoalescedEvents?.();
    const events =
      samples && samples.length > 0 ? samples : [event.nativeEvent];

    for (const sample of events) {
      const { x, y } = toWorld(sample.clientX, sample.clientY, rect);

      if (erasingRef.current) {
        eraseHere(x, y);
      } else if (liveRef.current) {
        const { type, points } = liveRef.current;
        const start = shapeStartRef.current;
        liveRef.current =
          isShapeType(type) && start
            ? {
                type,
                points: [
                  start,
                  clampPoint(
                    constrainShape(type, start, [x, y], sample.shiftKey),
                  ),
                ],
              }
            : {
                type,
                // The minimum spacing is a screen distance, so it shrinks in
                // world units as the zoom grows.
                points: appendPoint(points, x, y, MIN_POINT_DISTANCE / zoom),
              };
      }
    }

    if (liveRef.current) scheduleLiveRender();
  };

  const finishGesture = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (panRef.current) {
      panRef.current = null;
      event.currentTarget.style.cursor = cursor;
      return;
    }

    const erasing = erasingRef.current;
    if (erasing) {
      erasingRef.current = null;
      if (erasing.changed) commit(strokesRef.current, erasing.before);
      return;
    }

    const finished = liveRef.current;
    liveRef.current = null;
    shapeStartRef.current = null;
    setLive(null);
    if (!finished) return;
    const { type, points } = finished;

    // A click without a drag is not a shape (3 screen px, whatever the zoom).
    if (
      isShapeType(type) &&
      isDegenerateShape(
        points[0],
        points[1],
        MIN_SHAPE_SIZE / camRef.current.zoom,
      )
    )
      return;

    // Past the backend's bounds the stroke is dropped: persisting it would make
    // the whole save fail and take every later stroke down with it.
    if (!canAddStroke(strokesRef.current, points.length)) return;

    const { color: penColor, width: penWidth } = settingsRef.current;
    commit(
      [
        ...strokesRef.current,
        {
          id: newStrokeId(),
          // Omitted for freehand so old and new freehand strokes look identical
          // in storage.
          ...(isShapeType(type) ? { type } : {}),
          color: penColor,
          width: penWidth,
          points,
        },
      ],
      strokesRef.current,
    );
  };

  return (
    <>
      {/* Normal mode shows only what lies inside the text column: `clip` (not
          `auto`) so no scrollbar can ever appear, and strokes left, right or
          above the note stay hidden until draw mode. */}
      <div style={{ overflow: active ? "visible" : "clip" }}>
        <div
          ref={wrapRef}
          className="relative"
          style={{ minHeight: height ?? undefined }}
        >
          {children}

          {/* Display only: in draw mode the full-viewport layer below takes the
              pointer, so strokes outside the column are reachable too. */}
          <svg
            role="img"
            aria-label="Drawing over the note"
            className="pointer-events-none absolute left-0 top-0 z-[5] h-full w-full overflow-visible"
          >
            <StrokePaths strokes={strokes} />
            {live && <StrokeShape stroke={{ ...live, color, width }} />}
          </svg>
        </div>
      </div>

      {/* Portalled to <body>: a transformed ancestor (the world) would turn
          `fixed` into "fixed relative to the world", scaling the toolbar and
          misplacing the full-viewport layers. */}
      {active &&
        createPortal(
          <>
            <div aria-hidden className="fixed inset-0 z-[8] bg-page" />
            <div
              ref={layerRef}
              data-drawing-surface
              className="fixed inset-0 z-10"
              style={{ cursor, touchAction: "none" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={finishGesture}
              onPointerCancel={finishGesture}
            />

            <div
              role="toolbar"
              aria-label="Drawing tools"
              className="fixed bottom-6 left-1/2 z-30 flex -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-xs border border-rule bg-page px-3 py-2 shadow-sm"
              // After a mouse click (detail > 0) focus is not left on the button,
              // so a later Space starts a pan instead of re-pressing it.
              onClick={(event) => {
                if (event.detail > 0 && event.target instanceof Element) {
                  event.target.closest("button")?.blur();
                }
              }}
            >
              <Button
                size="sm"
                variant={tool === "pen" ? "secondary" : "quiet"}
                aria-pressed={tool === "pen"}
                aria-keyshortcuts="P"
                title="Pen (P)"
                onClick={() => selectTool("pen")}
              >
                Pen
              </Button>
              <Button
                size="sm"
                variant={tool === "hand" ? "secondary" : "quiet"}
                aria-pressed={tool === "hand"}
                aria-keyshortcuts="H"
                title="Hand: drag to move around (H, or hold Space)"
                onClick={() => selectTool("hand")}
              >
                Hand
              </Button>
              <ShapeMenu
                shape={lastShape}
                active={isShapeType(tool)}
                open={shapeMenuOpen}
                onOpenChange={setShapeMenuOpen}
                onSelect={selectTool}
              />
              <Button
                size="sm"
                variant={tool === "eraser" ? "secondary" : "quiet"}
                aria-pressed={tool === "eraser"}
                aria-keyshortcuts="E"
                title="Eraser (E)"
                onClick={() => selectTool("eraser")}
              >
                Eraser
              </Button>

              <span className="mx-1 h-5 w-px bg-rule" aria-hidden />

              {PEN_COLORS.map((swatch) => (
                <button
                  key={swatch}
                  type="button"
                  aria-label={`Color ${swatch.replace("var(--color-", "").replace(")", "")}`}
                  aria-pressed={color === swatch}
                  onClick={() => {
                    setColor(swatch);
                    setTool((current) =>
                      current === "eraser" || current === "hand"
                        ? "pen"
                        : current,
                    );
                  }}
                  className={cn(
                    "h-5 w-5 rounded-full border-2",
                    color === swatch
                      ? "border-ink ring-2 ring-primary"
                      : "border-rule",
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
                    setTool((current) =>
                      current === "eraser" || current === "hand"
                        ? "pen"
                        : current,
                    );
                  }}
                  className={cn(
                    "flex h-6 w-6 items-center justify-center rounded-xs border",
                    width === size
                      ? "border-ink bg-tint"
                      : "border-transparent hover:border-rule",
                  )}
                >
                  <span
                    className="rounded-full bg-ink"
                    style={{ width: size + 2, height: size + 2 }}
                  />
                </button>
              ))}

              <span className="mx-1 h-5 w-px bg-rule" aria-hidden />

              <span
                className="min-w-10 text-center font-heading text-xs text-muted"
                aria-label="Zoom"
              >
                {zoomLabel}%
              </span>
              <Button
                size="sm"
                variant="quiet"
                aria-keyshortcuts="0"
                title="Reset view (0)"
                onClick={resetView}
              >
                Reset view
              </Button>

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
          </>,
          document.body,
        )}
    </>
  );
};
