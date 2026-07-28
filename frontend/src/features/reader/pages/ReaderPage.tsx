import { useCallback, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, EmptyState, ErrorState, Loading } from '../../../components/ui';
import { getApiErrorMessage, getApiErrorStatus } from '../../../lib/apiError';
import { ReaderFrame } from '../components/ReaderFrame';
import { useReaderSource } from '../hooks/useReaderSource';
import { useSaveProgress } from '../hooks/useSaveProgress';

// Matches --body-size in the converted document.
const DEFAULT_FONT_SIZE = 19;
const MIN_FONT_SIZE = 15;
const MAX_FONT_SIZE = 28;

export const ReaderPage = () => {
  const { sourceId } = useParams();
  const id = Number(sourceId);
  const navigate = useNavigate();

  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [dark, setDark] = useState(false);

  const { data, isPending, isError, error, refetch } = useReaderSource(id);
  const saveProgress = useSaveProgress(id);

  const handleAnchorChange = useCallback(
    (anchor: string) => saveProgress(anchor),
    [saveProgress],
  );

  if (isPending) {
    return <Loading full label="Opening source" />;
  }

  if (isError) {
    return (
      <div className="mx-auto max-w-measure px-6 py-12">
        {getApiErrorStatus(error) === 404 ? (
          <EmptyState
            title="Source not found"
            description="It may have been deleted, or it belongs to another account."
          />
        ) : (
          <ErrorState
            title="Could not open this source"
            message={getApiErrorMessage(error)}
            onRetry={() => refetch()}
          />
        )}
      </div>
    );
  }

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex shrink-0 items-center justify-between gap-4 border-b border-rule px-4 py-2">
        <div className="flex min-w-0 items-center gap-3">
          <Button variant="quiet" size="sm" onClick={() => navigate(-1)}>
            &larr; Back
          </Button>
          <h1 className="min-w-0 truncate font-heading text-sm text-muted">{data.title}</h1>
        </div>

        <div className="flex shrink-0 items-center gap-1">
          <Button
            variant="quiet"
            size="sm"
            aria-label="Decrease text size"
            disabled={fontSize <= MIN_FONT_SIZE}
            onClick={() => setFontSize((size) => Math.max(MIN_FONT_SIZE, size - 1))}
          >
            A&minus;
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-label="Increase text size"
            disabled={fontSize >= MAX_FONT_SIZE}
            onClick={() => setFontSize((size) => Math.min(MAX_FONT_SIZE, size + 1))}
          >
            A+
          </Button>
          <Button
            variant="quiet"
            size="sm"
            aria-pressed={dark}
            onClick={() => setDark((value) => !value)}
          >
            {dark ? 'Light' : 'Dark'}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1">
        <ReaderFrame
          html={data.reader_html}
          title={data.title}
          initialAnchor={data.last_anchor}
          fontSize={fontSize}
          dark={dark}
          onAnchorChange={handleAnchorChange}
        />
      </div>
    </div>
  );
};
