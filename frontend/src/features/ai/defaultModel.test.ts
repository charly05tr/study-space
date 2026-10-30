import { describe, expect, it } from 'vitest';
import { pickDefaultModel } from './defaultModel';
import type { GeminiModel } from './types';

const models = (...names: string[]): GeminiModel[] =>
  names.map((name) => ({ name: `models/${name}`, displayName: name }));

describe('pickDefaultModel', () => {
  it('returns null for an empty list', () => {
    expect(pickDefaultModel([])).toBeNull();
  });

  it('prefers flash over pro', () => {
    expect(pickDefaultModel(models('gemini-2.5-pro', 'gemini-2.5-flash'))).toBe(
      'models/gemini-2.5-flash',
    );
  });

  it('skips lite and non-text flash variants', () => {
    expect(
      pickDefaultModel(
        models('gemini-2.5-flash-lite', 'gemini-2.5-flash-image', 'gemini-2.0-flash'),
      ),
    ).toBe('models/gemini-2.0-flash');
  });

  it('picks the newest version', () => {
    expect(
      pickDefaultModel(models('gemini-1.5-flash', 'gemini-2.5-flash', 'gemini-2.0-flash')),
    ).toBe('models/gemini-2.5-flash');
  });

  it('prefers a stable release over a preview of the same version', () => {
    expect(
      pickDefaultModel(models('gemini-3-flash-preview', 'gemini-3-flash')),
    ).toBe('models/gemini-3-flash');
  });

  it('falls back to the first model when there is no usable flash', () => {
    expect(pickDefaultModel(models('gemini-2.5-pro', 'gemini-2.5-flash-lite'))).toBe(
      'models/gemini-2.5-pro',
    );
  });
});
