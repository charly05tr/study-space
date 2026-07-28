import { cn } from './cn';

interface DividerProps {
  /** Breaks the rule with a centered gold lozenge — an editorial section break. */
  ornament?: boolean;
  className?: string;
}

export const Divider = ({ ornament = false, className }: DividerProps) => {
  if (!ornament) {
    return <hr className={cn('border-0 border-t border-rule', className)} aria-hidden />;
  }

  return (
    <div className={cn('flex items-center gap-4', className)} role="separator" aria-hidden>
      <span className="h-px flex-1 bg-rule" />
      <span className="text-xs text-primary">&#10086;</span>
      <span className="h-px flex-1 bg-rule" />
    </div>
  );
};
