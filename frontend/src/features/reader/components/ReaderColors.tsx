import { useEffect, useRef, useState } from 'react';
import { Button } from '../../../components/ui';
import { paletteFor } from '../readerPalette';
import { useReaderPrefsStore } from '../store/readerPrefsStore';

interface ReaderColorsProps {
  /** Which palette the swatches fall back to while no colour has been chosen. */
  dark: boolean;
}

/**
 * Page and text colour for the reading surface.
 *
 * Only these two are exposed. Rules, tints and muted text are derived from them
 * inside the frame, so there is no combination here that can leave a highlight
 * or a page rule invisible — see DERIVED_VARS in ReaderFrame.
 */
export const ReaderColors = ({ dark }: ReaderColorsProps) => {
  const [open, setOpen] = useState(false);
  const container = useRef<HTMLDivElement>(null);

  const pageColor = useReaderPrefsStore((state) => state.pageColor);
  const textColor = useReaderPrefsStore((state) => state.textColor);
  const setPageColor = useReaderPrefsStore((state) => state.setPageColor);
  const setTextColor = useReaderPrefsStore((state) => state.setTextColor);
  const resetColors = useReaderPrefsStore((state) => state.resetColors);

  // An <input type="color"> cannot show "unset", so an untouched swatch shows
  // the colour the theme is actually painting rather than an invented default.
  const palette = paletteFor(dark);
  const customised = pageColor !== null || textColor !== null;

  useEffect(() => {
    if (!open) return;

    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div ref={container} >
      <div className='mb-1.5'>
        <Button
          variant="quiet"
          size="sm"
          aria-expanded={open}
          aria-haspopup="dialog"
          onClick={() => setOpen((current) => !current)}
        >
          Colors
        </Button>
      </div>

      {open && (
        <div
          role="dialog"
          aria-label="Reading colors"
          className="absolute right-0 z-40 mt-1 w-56 rounded-xs border border-rule bg-page p-3 shadow-lg"
        >
          <Swatch
            label="Page"
            value={pageColor ?? palette['--page-background']}
            onChange={setPageColor}
          />
          <Swatch
            label="Text"
            value={textColor ?? palette['--text-color']}
            onChange={setTextColor}
          />

          <Button
            variant="quiet"
            size="sm"
            className="mt-2 w-full"
            disabled={!customised}
            onClick={resetColors}
          >
            Follow theme
          </Button>
        </div>
      )}
    </div>
  );
};

interface SwatchProps {
  label: string;
  value: string;
  onChange: (color: string) => void;
}

const Swatch = ({ label, value, onChange }: SwatchProps) => (
  <label className="flex items-center justify-between gap-3 py-1.5 text-sm text-ink">
    {label}
    <input
      type="color"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="h-7 w-12 cursor-pointer rounded-xs border border-rule bg-transparent p-0.5"
    />
  </label>
);
