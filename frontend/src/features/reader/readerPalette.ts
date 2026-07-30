/**
 * The two palettes the reader applies over the converted document's own :root
 * variables. Both converters declare the same variable names, so one palette
 * drives a reflowed book and a layout-faithful one alike.
 *
 * Lives outside the frame component because the colour controls need the same
 * values: an <input type="color"> has no concept of "unset", so a swatch that
 * is following the theme has to show what the theme is actually painting.
 */
export interface ReaderPalette {
  '--page-background': string;
  '--text-color': string;
  '--muted-color': string;
  '--rule-color': string;
  '--target-tint': string;
  '--selection-tint': string;
}

/**
 * 13.5:1 body, 6.1:1 muted.
 *
 * --selection-tint is deliberately a deeper gold than --target-tint: a live
 * selection and a saved highlight sit side by side in this document, and if
 * they shared a colour there would be no telling which is which.
 */
export const DARK_PALETTE: ReaderPalette = {
  '--page-background': '#1c1b21',
  '--text-color': '#e8e4da',
  '--muted-color': '#a09a8c',
  '--rule-color': '#34323a',
  '--target-tint': '#4a4128',
  '--selection-tint': '#5f5330', // 6.0:1 under --text-color
};

export const LIGHT_PALETTE: ReaderPalette = {
  '--page-background': '#fdfbf7',
  '--text-color': '#3d3b49',
  '--muted-color': '#6f685c',
  '--rule-color': '#e6e0d4',
  '--target-tint': '#f3e8cd',
  '--selection-tint': '#ecd694', // 7.6:1 under --text-color
};

export const paletteFor = (dark: boolean): ReaderPalette =>
  dark ? DARK_PALETTE : LIGHT_PALETTE;
