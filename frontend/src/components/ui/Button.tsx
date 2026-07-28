import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';
import { Spinner } from './Spinner';

export type ButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const base =
  'inline-flex items-center justify-center gap-2 rounded-xs border font-heading ' +
  'uppercase tracking-[0.14em] transition-colors duration-150 ' +
  'disabled:pointer-events-none disabled:opacity-45';

const variants: Record<ButtonVariant, string> = {
  /* Gold fill with on-primary text: 4.62:1. Not text-ink — that token flips
     light in dark mode and light on gold is 1.8:1. */
  primary:
    'border-primary bg-primary text-on-primary hover:border-primary-400 hover:bg-primary-400',
  secondary: 'border-ink bg-transparent text-ink hover:bg-tint',
  /* Transparent border keeps the box the same size as the other variants. */
  quiet: 'border-transparent bg-transparent text-muted hover:border-rule hover:text-ink',
  danger: 'border-danger bg-transparent text-danger hover:bg-danger-soft',
};

const sizes: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-5 py-2.5 text-sm',
  lg: 'px-7 py-3 text-base',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  children: ReactNode;
}

export const Button = ({
  variant = 'primary',
  size = 'md',
  loading = false,
  disabled,
  className,
  children,
  type = 'button',
  ...props
}: ButtonProps) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    className={cn(base, variants[variant], sizes[size], className)}
    {...props}
  >
    {loading && <Spinner size="sm" label={null} className="border-current/30 border-t-current" />}
    {children}
  </button>
);
