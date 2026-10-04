import * as React from 'react';

import { cn } from '../../lib/cn';

export interface EmptyStateProps extends Omit<React.HTMLAttributes<HTMLDivElement>, 'title'> {
  /** A lucide icon element, e.g. <FileText />. */
  icon?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** Usually the screen's primary "create" button. */
  action?: React.ReactNode;
}

/** Friendly placeholder for an empty list, used inside tables and cards. */
export function EmptyState({ icon, title, description, action, className, ...props }: EmptyStateProps) {
  return (
    <div
      className={cn('flex flex-col items-center justify-center gap-2 px-6 py-12 text-center', className)}
      {...props}
    >
      {icon ? (
        <div className="mb-1 flex h-12 w-12 items-center justify-center rounded-xl bg-accent text-accent-foreground [&_svg]:size-6">
          {icon}
        </div>
      ) : null}
      <p className="text-[15px] font-semibold text-foreground">{title}</p>
      {description ? <p className="max-w-sm text-sm text-muted-foreground">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}
