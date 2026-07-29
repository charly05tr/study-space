import type { RelationKind } from '../blocks/types';

export interface GraphPalette {
  page: string;
  ink: string;
  muted: string;
  rule: string;
  primary: string;
  danger: string;
}

/**
 * Reads the design tokens straight off the document.
 *
 * The scene has to flip with the theme like everything else, and the tokens
 * already do. Hardcoding hex values here would be a second, silently diverging
 * palette — the map would keep its light colours in dark mode.
 */
export const readPalette = (): GraphPalette => {
  const styles = getComputedStyle(document.documentElement);
  const token = (name: string, fallback: string) =>
    styles.getPropertyValue(name).trim() || fallback;

  return {
    page: token('--color-page', '#fdfbf7'),
    ink: token('--color-ink', '#3d3b49'),
    muted: token('--color-muted', '#6f685c'),
    rule: token('--color-rule', '#e6e0d4'),
    primary: token('--color-primary', '#daa520'),
    danger: token('--color-danger', '#9c3b32'),
  };
};

export interface EdgeStyle {
  /** `danger` for opposition, `rule` for everything else. */
  tone: 'rule' | 'danger';
  /** null draws a solid line. */
  dash: { size: number; gap: number } | null;
  opacity: number;
}

/**
 * Relations are told apart by STROKE, not by colour.
 *
 * A hue per relation type would need six colours the palette does not have, and
 * six colours nobody can tell apart at a glance anyway. The one exception is
 * `contradicts`: opposition is the single relation worth spotting without
 * reading the legend, so it gets the danger token.
 */
export const EDGE_STYLES: Record<RelationKind, EdgeStyle> = {
  relates: { tone: 'rule', dash: { size: 1.5, gap: 1.5 }, opacity: 0.35 },
  supports: { tone: 'rule', dash: null, opacity: 0.55 },
  contradicts: { tone: 'danger', dash: { size: 2.5, gap: 2 }, opacity: 0.7 },
  defines: { tone: 'rule', dash: { size: 6, gap: 2 }, opacity: 0.5 },
  example_of: { tone: 'rule', dash: { size: 0.6, gap: 2.2 }, opacity: 0.45 },
  derives_from: { tone: 'rule', dash: { size: 4, gap: 1.5 }, opacity: 0.5 },
};

/**
 * Node radius from how connected it is.
 *
 * Meaning, not decoration: an idea tied to many others should read as a hub.
 * Square root, so a node with sixteen links is four times the radius of one
 * with a single link rather than sixteen — linear scaling makes hubs swallow
 * the scene.
 */
export const nodeRadius = (degree: number): number => 1.1 + Math.sqrt(degree) * 0.7;
