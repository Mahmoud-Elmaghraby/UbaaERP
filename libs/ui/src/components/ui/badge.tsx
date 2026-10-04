import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';

import { cn } from '../../lib/cn';

/**
 * Status pill. The soft variants (success / warning / info / danger / neutral / brand)
 * are the standard way to show a document's state across every module, e.g.:
 *   posted → info, paid → success, partially paid → warning, overdue/cancelled → danger,
 *   draft → neutral. Pass `dot` for the small leading status dot used in tables.
 */
const badgeVariants = cva(
  'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-transparent px-2.5 py-0.5 text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'bg-primary text-primary-foreground',
        brand: 'bg-accent text-accent-foreground',
        secondary: 'bg-muted text-secondary-foreground',
        neutral: 'bg-muted text-secondary-foreground',
        success: 'bg-success-soft text-success',
        warning: 'bg-warning-soft text-warning',
        info: 'bg-info-soft text-info',
        danger: 'bg-danger-soft text-danger',
        destructive: 'bg-danger-soft text-danger',
        outline: 'border-border text-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  /** Small leading dot in the badge's own color. */
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot ? <span aria-hidden="true" className="h-1.5 w-1.5 shrink-0 rounded-full bg-current" /> : null}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
