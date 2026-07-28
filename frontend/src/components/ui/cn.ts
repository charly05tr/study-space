type ClassValue = string | number | false | null | undefined;

/**
 * Joins class names, dropping falsy values.
 *
 * This does NOT resolve Tailwind conflicts: if a caller passes `px-8` while a
 * variant already sets `px-5`, both land in the class attribute and the winner
 * is decided by stylesheet order, not by argument order. Keep component APIs
 * explicit (variants, sizes) instead of relying on `className` overrides.
 */
export const cn = (...classes: ClassValue[]): string =>
  classes.filter(Boolean).join(' ');
