import { useId } from 'react';
import type { ReactNode, SelectHTMLAttributes } from 'react';
import { cn } from './cn';
import { fieldClasses, labelClasses } from './Input';

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'id'> {
  label?: string;
  /** Helper text shown under the field. Hidden while an error is present. */
  hint?: string;
  error?: string;
  /** The <option> elements. Left to the caller so it owns the ordering. */
  children: ReactNode;
}

export const Select = ({ label, hint, error, className, children, ...props }: SelectProps) => {
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
      <select
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={message ? messageId : undefined}
        className={cn(
          fieldClasses,
          // Not bg-transparent like the other fields: the browser paints the
          // open dropdown with the element's own background, and transparent
          // there renders the options over whatever happens to be behind them.
          'bg-page',
          error && 'border-danger hover:border-danger',
          className,
        )}
        {...props}
      >
        {children}
      </select>
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
