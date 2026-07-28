import { useId } from 'react';
import type { InputHTMLAttributes } from 'react';
import { cn } from './cn';

/** Shared field chrome, reused by Textarea and Select. */
export const fieldClasses =
  'w-full rounded-xs border border-rule bg-transparent px-3 py-2 ' +
  'font-body text-ink placeholder:text-muted/60 transition-colors duration-150 ' +
  'hover:border-primary-200 focus:border-primary ' +
  'disabled:cursor-not-allowed disabled:opacity-50';

export const labelClasses =
  'font-heading text-xs uppercase tracking-[0.14em] text-muted';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'id'> {
  label?: string;
  /** Helper text shown under the field. Hidden while an error is present. */
  hint?: string;
  error?: string;
}

export const Input = ({ label, hint, error, className, ...props }: InputProps) => {
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
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(fieldClasses, error && 'border-danger hover:border-danger', className)}
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
