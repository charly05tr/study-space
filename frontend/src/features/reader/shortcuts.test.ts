import { describe, expect, it } from 'vitest';
import { actionForKey } from './shortcuts';

describe('actionForKey', () => {
  it('maps each reader key to its action', () => {
    expect(actionForKey('p', false)).toBe('togglePomodoro');
    expect(actionForKey('f', false)).toBe('toggleFocus');
    expect(actionForKey('t', false)).toBe('toggleTheme');
    expect(actionForKey('n', false)).toBe('toggleNotes');
  });

  it('does not care about shift or caps lock', () => {
    // Nothing in the reader distinguishes N from n, and a caps lock left on
    // must not quietly turn every shortcut off.
    expect(actionForKey('N', false)).toBe('toggleNotes');
    expect(actionForKey('F', false)).toBe('toggleFocus');
  });

  it('takes either way of typing a plus or a minus', () => {
    // On most layouts the plus IS Shift+=, so the unshifted key has to work.
    expect(actionForKey('+', false)).toBe('largerText');
    expect(actionForKey('=', false)).toBe('largerText');
    expect(actionForKey('-', false)).toBe('smallerText');
    expect(actionForKey('_', false)).toBe('smallerText');
  });

  it('leaves the notes key inert in focus mode', () => {
    // There is no panel in there to toggle: entering focus mode closes it.
    expect(actionForKey('n', true)).toBeNull();
  });

  it('keeps every other key working in focus mode', () => {
    expect(actionForKey('f', true)).toBe('toggleFocus');
    expect(actionForKey('t', true)).toBe('toggleTheme');
    expect(actionForKey('+', true)).toBe('largerText');
    expect(actionForKey('p', true)).toBe('togglePomodoro');
  });

  it('ignores keys that mean nothing here', () => {
    // The frame forwards every key it does not page with, so most of what
    // reaches this function is meant for nobody.
    expect(actionForKey('a', false)).toBeNull();
    expect(actionForKey('Enter', false)).toBeNull();
    expect(actionForKey('ArrowUp', false)).toBeNull();
    expect(actionForKey(' ', false)).toBeNull();
  });
});
