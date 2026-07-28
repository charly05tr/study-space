import type { HTMLAttributes, ReactNode } from 'react';
import { cn } from './cn';

interface CardProps extends HTMLAttributes<HTMLDivElement> {
  /** Adds a gold border on hover. Use only when the whole card is clickable. */
  interactive?: boolean;
  children: ReactNode;
}

export const Card = ({ interactive = false, className, children, ...props }: CardProps) => (
  <div
    className={cn(
      'rounded-xs border border-rule bg-page',
      interactive && 'cursor-pointer transition-colors duration-150 hover:border-primary',
      className,
    )}
    {...props}
  >
    {children}
  </div>
);

export const CardHeader = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('border-b border-rule px-5 py-4', className)} {...props}>
    {children}
  </div>
);

export const CardTitle = ({ className, children, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h3 className={cn('font-heading text-2xl leading-tight text-ink', className)} {...props}>
    {children}
  </h3>
);

export const CardDescription = ({
  className,
  children,
  ...props
}: HTMLAttributes<HTMLParagraphElement>) => (
  <p className={cn('mt-1 text-sm text-muted', className)} {...props}>
    {children}
  </p>
);

export const CardBody = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('px-5 py-4', className)} {...props}>
    {children}
  </div>
);

export const CardFooter = ({ className, children, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn('flex items-center gap-3 border-t border-rule px-5 py-3', className)}
    {...props}
  >
    {children}
  </div>
);
