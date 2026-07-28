import { useState } from 'react';
import type { ChangeEvent, FormEvent } from 'react';
import {
  Button,
  ErrorState,
  Input,
  fieldClasses,
  labelClasses,
  useNotification,
} from '../../../components/ui';
import { getApiErrorMessage, getFieldErrors } from '../../../lib/apiError';
import { useCreateSource } from '../hooks/useSourceMutations';

// SourceCreateSerializer.validate_file rejects anything above this.
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;
const MAX_UPLOAD_LABEL = '50 MB';

const validateFile = (file: File): string | undefined => {
  const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
  if (!isPdf) return 'Only PDF files are supported for now.';
  if (file.size > MAX_UPLOAD_BYTES) return `The file is larger than ${MAX_UPLOAD_LABEL}.`;
  return undefined;
};

interface AddSourceFormProps {
  studyspaceId: number;
  onDone: () => void;
}

export const AddSourceForm = ({ studyspaceId, onDone }: AddSourceFormProps) => {
  const { notify } = useNotification();
  const createSource = useCreateSource(studyspaceId);

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [fileError, setFileError] = useState<string>();

  const fieldErrors = getFieldErrors(createSource.error);

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    setFile(selected);
    setFileError(selected ? validateFile(selected) : undefined);
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!file || fileError) return;

    createSource.mutate(
      // Title omitted on purpose when blank: the serializer falls back to the
      // file name, which is a better default than an empty string.
      { file, study_space: studyspaceId, ...(title.trim() ? { title: title.trim() } : {}) },
      {
        onSuccess: () => {
          notify({
            variant: 'success',
            title: 'Source uploaded',
            message: 'Convert it to start reading.',
          });
          setFile(null);
          setTitle('');
          onDone();
        },
      },
    );
  };

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="flex flex-col gap-4 rounded-xs border border-rule p-4"
    >
      {createSource.isError && (
        <ErrorState title="Upload failed" message={getApiErrorMessage(createSource.error)} />
      )}

      <div className="flex flex-col gap-1.5">
        <label htmlFor="source-file" className={labelClasses}>
          PDF file
        </label>
        <input
          id="source-file"
          type="file"
          accept="application/pdf,.pdf"
          required
          onChange={handleFileChange}
          aria-invalid={fileError ? true : undefined}
          className={`${fieldClasses} file:mr-3 file:rounded-xs file:border file:border-rule file:bg-transparent file:px-3 file:py-1 file:font-heading file:text-xs file:uppercase file:tracking-[0.12em] file:text-ink`}
        />
        <p className={fileError ? 'text-sm text-danger' : 'text-sm text-muted'} role={fileError ? 'alert' : undefined}>
          {fileError ?? `PDF only, up to ${MAX_UPLOAD_LABEL}`}
        </p>
      </div>

      <Input
        label="Title (optional)"
        name="title"
        hint="Defaults to the file name"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        error={fieldErrors.title}
      />

      <div className="flex justify-end gap-2">
        <Button variant="quiet" size="sm" onClick={onDone}>
          Cancel
        </Button>
        <Button
          type="submit"
          size="sm"
          loading={createSource.isPending}
          disabled={!file || Boolean(fileError)}
        >
          Upload source
        </Button>
      </div>
    </form>
  );
};
