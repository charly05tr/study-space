import { Link } from 'react-router-dom';
import { Badge, Card, CardBody, CardTitle, ConfirmButton } from '../../../components/ui';
import { formatDate } from '../../../lib/formatDate';
import { ORIGIN_LABELS, STATUS_LABELS, STATUS_VARIANTS, questionCountLabel } from '../labels';
import type { QuizSummary } from '../types';

interface QuizCardProps {
  quiz: QuizSummary;
  deleting: boolean;
  onDelete: () => void;
}

export const QuizCard = ({ quiz, deleting, onDelete }: QuizCardProps) => (
  <Card>
    <CardBody className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <CardTitle className="min-w-0 text-xl">
          <Link
            to={`/studyspace/${quiz.studyspace}/quizzes/${quiz.id}`}
            className="underline-offset-2 hover:underline"
          >
            {quiz.title}
          </Link>
        </CardTitle>
        <ConfirmButton confirmLabel="Delete quiz?" loading={deleting} onConfirm={onDelete}>
          Delete
        </ConfirmButton>
      </div>

      {quiz.description && <p className="text-sm text-muted">{quiz.description}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={STATUS_VARIANTS[quiz.status]}>{STATUS_LABELS[quiz.status]}</Badge>
        <Badge variant={quiz.origin === 'ai' ? 'primary' : 'neutral'}>
          {ORIGIN_LABELS[quiz.origin]}
        </Badge>
        <span className="font-heading text-xs uppercase tracking-[0.14em] text-muted">
          {questionCountLabel(quiz.question_count)}
          {' · '}
          <time dateTime={quiz.updated_at}>{formatDate(quiz.updated_at)}</time>
        </span>
      </div>
    </CardBody>
  </Card>
);
