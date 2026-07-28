import { useNavigate } from 'react-router-dom';
import { Badge, Button, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { SOURCE_TYPE_LABEL } from '../../studyspaces/labels';
import type { SourceMinimal } from '../../studyspaces/types';
import { useConvertSource } from '../hooks/useSourceMutations';

interface SourceRowProps {
  source: SourceMinimal;
  studyspaceId: number;
}

export const SourceRow = ({ source, studyspaceId }: SourceRowProps) => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const convert = useConvertSource(studyspaceId);

  const isPdf = source.source_type === 'pdf';

  const handleConvert = () => {
    convert.mutate(source.id, {
      onSuccess: (result) => {
        notify({
          variant: 'success',
          title: 'Conversion finished',
          message: `"${result.title}" is ready to read.`,
        });
      },
      onError: (error) => {
        notify({
          variant: 'error',
          title: 'Conversion failed',
          message: getApiErrorMessage(error),
        });
      },
    });
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-ink">{source.title}</span>

      <span className="flex shrink-0 items-center gap-2">
        <Badge variant={source.is_converted ? 'success' : 'neutral'}>
          {source.is_converted ? 'Ready' : 'Not converted'}
        </Badge>
        <Badge>{SOURCE_TYPE_LABEL[source.source_type] ?? source.source_type}</Badge>

        {isPdf && (
          <>
            <Button variant="quiet" size="sm" loading={convert.isPending} onClick={handleConvert}>
              {source.is_converted ? 'Reconvert' : 'Convert'}
            </Button>
            {/* Reading before conversion would silently trigger a full convert
                inside the reader, with no progress feedback. */}
            <Button
              variant="secondary"
              size="sm"
              disabled={!source.is_converted || convert.isPending}
              onClick={() => navigate(`/source/${source.id}`)}
            >
              Read
            </Button>
          </>
        )}
      </span>
    </li>
  );
};
