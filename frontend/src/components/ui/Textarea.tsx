import { useId } from 'react';
import type { TextareaHTMLAttributes } from 'react';
import { cn } from './cn';
import { fieldClasses, labelClasses } from './Input';

interface TextareaProps extends Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, 'id'> {
  label?: string;
  hint?: string;
  error?: string;
}

export const Textarea = ({ label, hint, error, className, rows = 4, ...props }: TextareaProps) => {
  const id = useId();
  const messageId = `${id}-message`;
  const message = error ?? hint;

  return (
    <div className="flex flex-col gap-1.5">
      {label && (
        <label htmlFor={id} className={labelClasses}>
          {label}
        </label>
      )}
      <textarea
        id={id}
        rows={rows}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          fieldClasses,
          'resize-y leading-relaxed',
          error && 'border-danger hover:border-danger',
          className,
        )}
        {...props}
      />
      {message && (
        <p
          id={messageId}
          role={error ? 'alert' : undefined}
          className={cn('text-sm', error ? 'text-danger' : 'text-muted')}
        >
          {message}
        </p>
      )}
    </div>
  );
};
