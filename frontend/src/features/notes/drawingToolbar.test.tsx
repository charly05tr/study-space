import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DrawingLayer } from './components/DrawingLayer';
import { EMPTY_DRAWING } from './drawing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;
const onExit = vi.fn();

beforeEach(() => {
  // jsdom does not implement scrolling; the layer restores the scroll position on exit.
  window.scrollTo = vi.fn() as unknown as typeof window.scrollTo;
  onExit.mockClear();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const mount = async () => {
  await act(async () => {
    root.render(
      <DrawingLayer initialDrawing={EMPTY_DRAWING} active onExit={onExit} onChange={() => {}}>
        <div />
      </DrawingLayer>,
    );
  });
};

const trigger = () => container.ownerDocument.querySelector<HTMLButtonElement>('[data-shape-trigger]')!;
const menu = () => document.querySelector('[role="menu"]');
const items = () => Array.from(document.querySelectorAll<HTMLElement>('[role="menuitemradio"]'));

const press = async (key: string, target: EventTarget = window) => {
  await act(async () => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  });
};

const open = async () => {
  await act(async () => {
    trigger().click();
  });
};

describe('shapes dropdown', () => {
  it('shows the default shape and is closed initially', async () => {
    await mount();
    expect(trigger().textContent).toContain('Rectangle');
    expect(trigger().getAttribute('aria-haspopup')).toBe('menu');
    expect(trigger().getAttribute('aria-expanded')).toBe('false');
    expect(menu()).toBeNull();
  });

  it('lists every shape with its shortcut and marks the current one', async () => {
    await mount();
    await open();

    expect(trigger().getAttribute('aria-expanded')).toBe('true');
    expect(items().map((item) => item.textContent)).toEqual([
      'RectangleR',
      'EllipseO',
      'LineL',
      'ArrowA',
    ]);
    expect(items().map((item) => item.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
  });

  it('selects a shape, activates it, closes, and remembers it', async () => {
    await mount();
    await open();
    await act(async () => items()[3].click());

    expect(menu()).toBeNull();
    expect(trigger().textContent).toContain('Arrow');
    expect(trigger().getAttribute('aria-pressed')).toBe('true');
  });

  it('closes on Escape without leaving pen mode, then Escape exits', async () => {
    await mount();
    await open();

    await press('Escape');
    expect(menu()).toBeNull();
    expect(onExit).not.toHaveBeenCalled();

    await press('Escape');
    expect(onExit).toHaveBeenCalledTimes(1);
  });

  it('keeps the single-key shortcuts and syncs the button', async () => {
    await mount();
    await press('o');
    expect(trigger().textContent).toContain('Ellipse');
    expect(trigger().getAttribute('aria-pressed')).toBe('true');

    await press('p');
    // The pen is active now, but the button remembers the last shape.
    expect(trigger().textContent).toContain('Ellipse');
    expect(trigger().getAttribute('aria-pressed')).toBe('false');

    await press('l');
    expect(trigger().textContent).toContain('Line');
  });

  it('opens from the keyboard and moves focus with the arrows', async () => {
    await mount();
    trigger().focus();
    await press('ArrowDown', trigger());

    expect(menu()).not.toBeNull();
    expect(document.activeElement).toBe(items()[0]);

    await press('ArrowDown', items()[0]);
    expect(document.activeElement).toBe(items()[1]);

    await press('ArrowUp', items()[1]);
    await press('ArrowUp', items()[0]);
    expect(document.activeElement).toBe(items()[3]);
  });

  it('closes on Tab and on a pointerdown outside', async () => {
    await mount();
    await open();
    await press('Tab', items()[0]);
    expect(menu()).toBeNull();

    await open();
    await act(async () => {
      document.body.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(menu()).toBeNull();
  });

  it('closes when drawing starts on the surface', async () => {
    await mount();
    await open();
    const surface = document.querySelector<HTMLElement>('[data-drawing-surface]')!;
    surface.setPointerCapture = () => {};
    await act(async () => {
      surface.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(menu()).toBeNull();
  });
});

describe('camera and draw-mode environment', () => {
  const zoomLabel = () => document.querySelector('[aria-label="Zoom"]')!.textContent;
  const surface = () => document.querySelector<HTMLElement>('[data-drawing-surface]')!;

  it('selects the hand tool with H', async () => {
    await mount();
    await press('h');
    const hand = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Hand')!;
    expect(hand.getAttribute('aria-pressed')).toBe('true');
    expect(surface().style.cursor).toBe('grab');
  });

  it('zooms with the wheel (non-passive, default prevented) and resets with 0', async () => {
    await mount();
    expect(zoomLabel()).toBe('100%');

    const event = new WheelEvent('wheel', { deltaY: -100, clientX: 200, clientY: 200, cancelable: true, bubbles: true });
    await act(async () => {
      surface().dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(Number.parseInt(zoomLabel()!)).toBeGreaterThan(100);

    await press('0');
    expect(zoomLabel()).toBe('100%');
  });

  it('freezes page scroll while drawing and restores everything afterwards', async () => {
    document.documentElement.style.overflow = 'auto';
    await mount();
    expect(document.documentElement.style.overflow).toBe('hidden');

    await act(async () => {
      root.render(
        <DrawingLayer initialDrawing={EMPTY_DRAWING} active={false} onExit={onExit} onChange={() => {}}>
          <div />
        </DrawingLayer>,
      );
    });
    expect(document.documentElement.style.overflow).toBe('auto');
    expect(window.scrollTo).toHaveBeenCalled();
    expect(document.querySelector('[data-drawing-surface]')).toBeNull();
    document.documentElement.style.overflow = '';
  });

  it('clips to the text column outside draw mode and shows everything inside it', async () => {
    await act(async () => {
      root.render(
        <DrawingLayer initialDrawing={EMPTY_DRAWING} active={false} onExit={onExit} onChange={() => {}}>
          <div data-child />
        </DrawingLayer>,
      );
    });
    const clip = container.querySelector('[data-child]')!.parentElement!.parentElement!;
    expect(clip.style.overflow).toBe('clip');
  });

  it('moves the note page with the camera, not the toolbar', async () => {
    await act(async () => {
      root.render(
        <article>
          <DrawingLayer initialDrawing={EMPTY_DRAWING} active onExit={onExit} onChange={() => {}}>
            <div />
          </DrawingLayer>
        </article>,
      );
    });
    const article = container.querySelector('article')!;
    expect(article.style.transformOrigin).toMatch(/^0(px)? 0(px)?$/);
    // The toolbar is portalled out of the transformed page.
    expect(article.querySelector('[role="toolbar"]')).toBeNull();
    expect(document.querySelector('[role="toolbar"]')).not.toBeNull();
  });

  const pointer = async (type: string, x = 50, y = 10) => {
    await act(async () => {
      surface().dispatchEvent(
        new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0 }),
      );
    });
  };

  it('Space after a toolbar click pans instead of re-pressing the focused button', async () => {
    await mount();
    surface().setPointerCapture = () => {};
    const undoButton = Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Undo')!;
    undoButton.focus();

    const down = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
    const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
    await act(async () => {
      undoButton.dispatchEvent(down);
    });
    expect(down.defaultPrevented).toBe(true);
    expect(surface().style.cursor).toBe('grab');
    await act(async () => {
      undoButton.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true);

    // A press on the drawing surface takes focus off the toolbar button.
    undoButton.focus();
    await pointer('pointerdown');
    expect(document.activeElement).not.toBe(undoButton);
  });

  it('does not touch the scroll position when unmounting (navigating away)', async () => {
    const other = document.createElement('div');
    document.body.appendChild(other);
    const otherRoot = createRoot(other);
    await act(async () => {
      otherRoot.render(
        <DrawingLayer initialDrawing={EMPTY_DRAWING} active onExit={onExit} onChange={() => {}}>
          <div />
        </DrawingLayer>,
      );
    });
    expect(document.documentElement.style.overflow).toBe('hidden');
    (window.scrollTo as ReturnType<typeof vi.fn>).mockClear();

    await act(async () => otherRoot.unmount());
    expect(window.scrollTo).not.toHaveBeenCalled();
    expect(document.documentElement.style.overflow).toBe('');
    other.remove();
  });

  it('ignores the wheel while a pan is in progress', async () => {
    await mount();
    surface().setPointerCapture = () => {};
    await press('h');
    await pointer('pointerdown');

    const wheel = new WheelEvent('wheel', { deltaY: -100, clientX: 100, clientY: 100, cancelable: true, bubbles: true });
    await act(async () => {
      surface().dispatchEvent(wheel);
    });
    expect(wheel.defaultPrevented).toBe(true);
    expect(zoomLabel()).toBe('100%');

    await pointer('pointerup');
    await act(async () => {
      surface().dispatchEvent(new WheelEvent('wheel', { deltaY: -100, cancelable: true, bubbles: true }));
    });
    expect(Number.parseInt(zoomLabel()!)).toBeGreaterThan(100);
  });

  it('commits an erase that was cut short by leaving draw mode', async () => {
    const onChange = vi.fn();
    const drawing = {
      ...EMPTY_DRAWING,
      strokes: [{ id: 's', color: 'var(--color-ink)', width: 4, points: [[10, 10], [100, 10]] as [number, number][] }],
    };
    const tree = (active: boolean) => (
      <DrawingLayer initialDrawing={drawing} active={active} onExit={onExit} onChange={onChange}>
        <div />
      </DrawingLayer>
    );
    await act(async () => {
      root.render(tree(true));
    });
    surface().setPointerCapture = () => {};
    await press('e');
    await pointer('pointerdown', 50, 10);
    expect(onChange).not.toHaveBeenCalled();

    // Esc / Done while the pointer is still down.
    await act(async () => {
      root.render(tree(false));
    });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].strokes).toEqual([]);
  });

  it('Esc is handled once: it exits drawing but does not reach other Esc handlers', async () => {
    await mount();
    const bubbled = vi.fn();
    document.addEventListener('keydown', bubbled);
    await press('Escape', document.body);
    document.removeEventListener('keydown', bubbled);

    expect(onExit).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
  });
});
