import type { NotificationVariant } from '../../components/ui';
import type { ConversionResult } from './types';

const plural = (count: number, one: string, many: string): string =>
  `${count} ${count === 1 ? one : many}`;

export interface ConversionSummary {
  variant: NotificationVariant;
  title: string;
  message: string;
}

/**
 * Words for what a conversion did, e.g. "3 created, 2 already had a flashcard".
 * Every bucket the server reports is named: a silently dropped question would
 * look like a bug.
 */
export const summarizeConversion = (result: ConversionResult): ConversionSummary => {
  const created = result.created.length;
  const parts: string[] = [];

  if (created > 0) parts.push(`${created} created`);
  if (result.skipped.length > 0) {
    parts.push(
      `${result.skipped.length} already ${result.skipped.length === 1 ? 'had a flashcard' : 'had flashcards'}`,
    );
  }
  if (result.not_published.length > 0) {
    parts.push(
      `${plural(result.not_published.length, 'question', 'questions')} skipped: publish the quiz first`,
    );
  }
  if (result.not_found.length > 0) {
    parts.push(`${plural(result.not_found.length, 'question was', 'questions were')} not found`);
  }

  const message = parts.length > 0 ? parts.join(', ') : 'Nothing to convert.';

  if (created > 0) {
    return {
      variant: 'success',
      title: created === 1 ? 'Flashcard created' : 'Flashcards created',
      message,
    };
  }
  return { variant: 'info', title: 'No new flashcards', message };
};
