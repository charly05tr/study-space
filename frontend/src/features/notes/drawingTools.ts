import type { ShapeType } from './shapes';

export type Tool = 'pen' | 'hand' | 'eraser' | ShapeType;

export interface ToolEntry {
  tool: Tool;
  label: string;
  /** Excalidraw-style single-key shortcut, lowercase. */
  key: string;
}

export const PEN_TOOL: ToolEntry = { tool: 'pen', label: 'Pen', key: 'p' };
export const HAND_TOOL: ToolEntry = { tool: 'hand', label: 'Hand', key: 'h' };
export const ERASER_TOOL: ToolEntry = { tool: 'eraser', label: 'Eraser', key: 'e' };

/** Order here is the order of the shapes dropdown. */
export const SHAPE_TOOLS: (ToolEntry & { tool: ShapeType })[] = [
  { tool: 'rect', label: 'Rectangle', key: 'r' },
  { tool: 'ellipse', label: 'Ellipse', key: 'o' },
  { tool: 'line', label: 'Line', key: 'l' },
  { tool: 'arrow', label: 'Arrow', key: 'a' },
];

export const DEFAULT_SHAPE: ShapeType = 'rect';

const ALL_TOOLS: ToolEntry[] = [PEN_TOOL, HAND_TOOL, ...SHAPE_TOOLS, ERASER_TOOL];

/** The tool a single-key shortcut selects, if any. */
export const toolForKey = (key: string): ToolEntry | undefined =>
  ALL_TOOLS.find((entry) => entry.key === key.toLowerCase());

export const shapeEntry = (shape: ShapeType) =>
  SHAPE_TOOLS.find((entry) => entry.tool === shape) ?? SHAPE_TOOLS[0];

/** Moves a menu index by `delta`, wrapping at both ends. */
export const wrapIndex = (index: number, delta: number, length: number): number =>
  length === 0 ? 0 : (((index + delta) % length) + length) % length;
