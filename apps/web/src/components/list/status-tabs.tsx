import { cn } from '@erp-platform/ui';

/**
 * The segmented status filter above every document list ("All · Draft ·
 * Posted…"), optionally with a count per tab.
 */
export function StatusTabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  counts,
}: {
  tabs: readonly T[];
  value: T;
  onChange: (value: T) => void;
  label: (tab: T) => string;
  counts?: Partial<Record<T, number>>;
}) {
  return (
    <div className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
      {tabs.map((tab) => (
        <button
          key={tab}
          type="button"
          onClick={() => onChange(tab)}
          className={cn(
            'flex items-center gap-1.5 rounded-md px-3 py-1 text-sm font-medium transition-colors',
            value === tab ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
          )}
        >
          {label(tab)}
          {counts?.[tab] !== undefined ? <span className="rounded bg-muted-foreground/10 px-1.5 text-xs tabular-nums">{counts[tab]}</span> : null}
        </button>
      ))}
    </div>
  );
}
