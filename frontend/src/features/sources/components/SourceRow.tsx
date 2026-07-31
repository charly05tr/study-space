import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, useNotification } from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import { SOURCE_TYPE_LABEL } from '../../studyspaces/labels';
import type { ConverterMode, SourceMinimal } from '../../studyspaces/types';
import { useConvertSource } from '../hooks/useSourceMutations';
import { CONVERTER_HINT, CONVERTER_LABEL } from '../types';

const CONVERTER_MODES: ConverterMode[] = ['reflow', 'layout'];

interface SourceRowProps {
  source: SourceMinimal;
  studyspaceId: number;
}

export const SourceRow = ({ source, studyspaceId }: SourceRowProps) => {
  const navigate = useNavigate();
  const { notify } = useNotification();
  const convert = useConvertSource(studyspaceId);

  // Seeded from the source so the select shows what is actually stored; from
  // then on it is a pending choice, applied by the next conversion.
  const [mode, setMode] = useState<ConverterMode>(source.converter_mode);

  const isPdf = source.source_type === 'pdf';
  // Picking a different method changes nothing until the file is rebuilt with
  // it, so the button stops being an afterthought and asks to be pressed.
  const needsRebuild = source.is_converted && mode !== source.converter_mode;

  const handleConvert = () => {
    convert.mutate(
      { sourceId: source.id, mode },
      {
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
      },
    );
  };

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 border-b border-rule/60 py-2 last:border-b-0">
      <span className="min-w-0 flex-1 truncate text-ink">{source.title}</span>

      <span className="flex shrink-0 flex-wrap items-center gap-2">
        {/* <Badge variant={source.is_converted ? 'success' : 'neutral'}>
          {source.is_converted ? 'Ready' : 'Not converted'}
        </Badge> */}
        <Badge>{SOURCE_TYPE_LABEL[source.source_type] ?? source.source_type}</Badge>

        {isPdf && (
          <>
            <label className="flex items-center gap-1.5">
              <span className="sr-only">Conversion method</span>
              <select
                value={mode}
                title={CONVERTER_HINT[mode]}
                disabled={convert.isPending}
                onChange={(event) => setMode(event.target.value as ConverterMode)}
                className="rounded-xs border border-rule bg-page px-2 py-1 text-xs text-ink disabled:opacity-45"
              >
                {CONVERTER_MODES.map((option) => (
                  <option key={option} value={option}>
                    {CONVERTER_LABEL[option]}
                  </option>
                ))}
              </select>
            </label>

            <Button
              variant={needsRebuild ? 'primary' : 'quiet'}
              size="sm"
              loading={convert.isPending}
              onClick={handleConvert}
            >
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
