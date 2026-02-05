import { HTMLAttributes } from 'react';
import { cn } from '../../lib/utils';

export interface BadgeProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'success' | 'warning' | 'destructive';
}

function Badge({ className, variant = 'default', ...props }: BadgeProps) {
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[hsl(var(--ring))] focus:ring-offset-2',
        {
          'border-transparent bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))]': variant === 'default',
          'border-transparent bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))]': variant === 'secondary',
          'border-[hsl(var(--border))] text-[hsl(var(--foreground))]': variant === 'outline',
          'border-[hsl(var(--status-success-border))] bg-[hsl(var(--status-success-bg))] text-[hsl(var(--status-success-fg))]': variant === 'success',
          'border-[hsl(var(--status-warning-border))] bg-[hsl(var(--status-warning-bg))] text-[hsl(var(--status-warning-fg))]': variant === 'warning',
          'border-[hsl(var(--status-danger-border))] bg-[hsl(var(--status-danger-bg))] text-[hsl(var(--status-danger-fg))]': variant === 'destructive',
        },
        className
      )}
      {...props}
    />
  );
}

export { Badge };
