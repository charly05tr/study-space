import { Link } from 'react-router-dom';
import { Badge, Card, CardBody, CardTitle } from '../../../components/ui';
import { formatDate } from '../../../lib/formatDate';
import type { StudyspaceListItem } from '../types';

interface StudyspaceCardProps {
  studyspace: StudyspaceListItem;
}

export const StudyspaceCard = ({ studyspace }: StudyspaceCardProps) => (
  <Link to={`/studyspace/${studyspace.id}`} className="block">
    <Card interactive className="h-full">
      <CardBody className="flex h-full flex-col gap-3">
        <CardTitle>{studyspace.title}</CardTitle>

        {studyspace.tags.length > 0 && (
          <ul className="flex flex-wrap gap-2">
            {studyspace.tags.map((tag) => (
              <li key={tag}>
                <Badge>{tag}</Badge>
              </li>
            ))}
          </ul>
        )}

        <p className="mt-auto font-heading text-xs uppercase tracking-[0.14em] text-muted">
          <time dateTime={studyspace.created_at}>{formatDate(studyspace.created_at)}</time>
        </p>
      </CardBody>
    </Card>
  </Link>
);
