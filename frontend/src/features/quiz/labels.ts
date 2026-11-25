import type { BadgeVariant } from '../../components/ui';
import type { QuizOrigin, QuizStatus } from './types';

export const STATUS_LABELS: Record<QuizStatus, string> = {
  draft: 'Draft',
  published: 'Published',
};

export const STATUS_VARIANTS: Record<QuizStatus, BadgeVariant> = {
  draft: 'neutral',
  published: 'success',
};

export const ORIGIN_LABELS: Record<QuizOrigin, string> = {
  ai: 'AI',
  manual: 'Manual',
};

export const questionCountLabel = (count: number): string =>
  `${count} ${count === 1 ? 'question' : 'questions'}`;
