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
    const svg = container.querySelector('svg[aria-label="Drawing over the note"]')!;
    svg.setPointerCapture = () => {};
    await act(async () => {
      svg.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));
    });
    expect(menu()).toBeNull();
  });
});
