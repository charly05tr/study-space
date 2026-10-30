import type { GeminiModel } from './types';

/** Variants that are flash by name but not general text models, or are the cut-down tier. */
const EXCLUDED = /lite|image|tts|audio|live/i;
const PRE_RELEASE = /preview|exp/i;

/** `gemini-2.5-flash` -> 2.5. NaN when the name carries no version. */
const versionOf = (name: string): number => {
  const match = /gemini-(\d+(?:\.\d+)?)/i.exec(name);
  return match ? Number(match[1]) : Number.NaN;
};

/**
 * The model the settings pick on a fresh connection.
 *
 * Flash is the right default for a writing review: fast and cheap enough to
 * run on every note. Lite is skipped because its feedback is noticeably
 * shallower. The newest version wins; among equals a stable release beats a
 * preview, then the API's own order decides.
 */
export const pickDefaultModel = (models: GeminiModel[]): string | null => {
  if (models.length === 0) return null;

  const flash = models.filter(
    (model) => /flash/i.test(model.name) && !EXCLUDED.test(model.name),
  );
  if (flash.length === 0) return models[0].name;

  const rank = (model: GeminiModel) => {
    const version = versionOf(model.name);
    return Number.isNaN(version) ? -1 : version;
  };

  return [...flash].sort(
    (a, b) =>
      rank(b) - rank(a) ||
      Number(PRE_RELEASE.test(a.name)) - Number(PRE_RELEASE.test(b.name)),
  )[0].name;
};
