import * as React from 'react';

import { cn } from '../../lib/cn';

export interface PageHeaderProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  title: React.ReactNode;
  /** One short sentence under the title explaining what the screen is for. */
  description?: React.ReactNode;
  /** Primary/secondary actions, aligned to the end side (left in RTL). */
  actions?: React.ReactNode;
}

/**
 * The one standard header every screen starts with — title, optional description and
 * actions in a fixed place, so the primary action is always where the user expects it.
 * Breadcrumbs are rendered by the app shell's top bar, not here.
 */
export function PageHeader({ title, description, actions, className, ...props }: PageHeaderProps) {
  return (
    <div
      className={cn('flex flex-wrap items-end justify-between gap-x-6 gap-y-3', className)}
      {...props}
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h1 className="text-2xl font-bold leading-tight text-foreground">{title}</h1>
        {description ? <p className="max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}
