import { useState } from 'react';
import {
  ActionMenu,
  Button,
  ConfirmButton,
  labelClasses,
  useNotification,
} from '../../../components/ui';
import { getApiErrorMessage } from '../../../lib/apiError';
import type { ConverterMode, SourceMinimal } from '../../studyspaces/types';
import { useConvertSource, useDeleteSource } from '../hooks/useSourceMutations';
import { CONVERTER_HINT, CONVERTER_LABEL } from '../types';

const CONVERTER_MODES: ConverterMode[] = ['reflow', 'layout'];

interface SourceMenuProps {
  source: SourceMinimal;
  studyspaceId: number;
  /** Hands the rename back to the row: that form replaces the whole row. */
  onRename: () => void;
}

/**
 * Everything you can do to a source except read it.
 *
 * The row used to carry the conversion picker, Convert, Read, Rename and Delete
 * side by side — five controls for one line of text, and the only one you reach
 * for often was Read. Folding the rest behind one button is what lets Read stay
 * a button instead of competing with four others.
 */
export const SourceMenu = ({ source, studyspaceId, onRename }: SourceMenuProps) => {
  const { notify } = useNotification();
  const convert = useConvertSource(studyspaceId);
  const remove = useDeleteSource(studyspaceId);

  // Seeded from the source so the select shows what is actually stored; from
  // then on it is a pending choice, applied by the next conversion.
  const [mode, setMode] = useState<ConverterMode>(source.converter_mode);

  const isPdf = source.source_type === 'pdf';
  // Picking a different method changes nothing until the file is rebuilt with
  // it, so the button stops being an afterthought and asks to be pressed.
  const needsRebuild = source.is_converted && mode !== source.converter_mode;

  const handleConvert = () => {
    // The panel stays open on purpose: converting a book takes minutes, and the
    // spinner on this button is the only thing saying the work started.
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

  const handleDelete = () => {
    remove.mutate(source.id, {
      onSuccess: () => {
        notify({
          variant: 'success',
          title: 'Source deleted',
          message: `"${source.title}" and its annotations are gone.`,
        });
      },
      onError: (error) => {
        notify({
          variant: 'error',
          title: 'Could not delete it',
          message: getApiErrorMessage(error),
        });
      },
    });
  };

  return (
    <ActionMenu label={`Actions for ${source.title}`} width="w-64">
      {(close) => (
        <>
          {isPdf && (
            <div className="mb-3 flex flex-col gap-2 border-b border-rule pb-3">
              <label className="flex flex-col gap-1.5">
                <span className={labelClasses}>Conversion method</span>
                <select
                  value={mode}
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

              {/* Was a title attribute on the select — a tooltip nobody finds.
                  In here there is room to just say what each method does. */}
              <p className="text-xs text-muted">{CONVERTER_HINT[mode]}</p>

              <Button
                variant={needsRebuild ? 'primary' : 'quiet'}
                size="sm"
                className="w-full"
                loading={convert.isPending}
                onClick={handleConvert}
              >
                {source.is_converted ? 'Reconvert' : 'Convert'}
              </Button>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <Button
              variant="quiet"
              size="sm"
              className="w-full"
              onClick={() => {
                close();
                onRename();
              }}
            >
              Rename
            </Button>

            {/* Two clicks: this takes the uploaded file and every highlight made
                on it, and none of that comes back. */}
            <ConfirmButton
              confirmLabel="Delete for good"
              className="w-full"
              loading={remove.isPending}
              disabled={convert.isPending}
              onConfirm={handleDelete}
            >
              Delete
            </ConfirmButton>
          </div>
        </>
      )}
    </ActionMenu>
  );
};
