import * as React from 'react';
import { Check, ChevronsUpDown, Search } from 'lucide-react';

import { cn } from '../../lib/cn';
import { Popover, PopoverContent, PopoverTrigger } from './popover';

export interface ComboboxProps<T> {
  items: readonly T[];
  value: string | null | undefined;
  onValueChange: (value: string, item: T) => void;
  getValue: (item: T) => string;
  /** Text shown in the trigger for the selected item. */
  getLabel: (item: T) => string;
  /**
   * Returns the items matching a query, best match first. Called with the
   * trimmed query; when omitted, a case-insensitive "label contains" filter
   * is used. The first returned item is highlighted, so Enter picks the
   * best match — which is what makes typing/scanning a code + Enter work.
   */
  search?: (items: readonly T[], query: string) => T[];
  /** Custom row content; defaults to getLabel(item). */
  renderItem?: (item: T) => React.ReactNode;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Rows rendered at most (the list is not virtualized). */
  maxResults?: number;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

/**
 * Searchable single-select: a trigger button that opens a popover with a
 * search box and a keyboard-navigable result list (↑/↓, Enter, Esc).
 * Replaces plain <Select> wherever the option list can grow large — a
 * product catalogue of thousands of items is unusable as a scroll-only list.
 */
export function Combobox<T>({
  items,
  value,
  onValueChange,
  getValue,
  getLabel,
  search,
  renderItem,
  placeholder = 'اختر…',
  searchPlaceholder = 'بحث…',
  emptyText = 'لا توجد نتائج',
  maxResults = 50,
  disabled,
  className,
  'aria-label': ariaLabel,
}: ComboboxProps<T>) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [active, setActive] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement>(null);
  const listId = React.useId();

  const selected = React.useMemo(
    () => (value ? items.find((item) => getValue(item) === value) : undefined),
    [items, value, getValue],
  );

  const results = React.useMemo(() => {
    const trimmed = query.trim();
    let matched: T[];
    if (!trimmed) matched = items.slice();
    else if (search) matched = search(items, trimmed);
    else {
      const needle = trimmed.toLowerCase();
      matched = items.filter((item) => getLabel(item).toLowerCase().includes(needle));
    }
    return matched.slice(0, maxResults);
  }, [items, query, search, getLabel, maxResults]);

  React.useEffect(() => setActive(0), [query, open]);

  React.useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    row?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  function choose(item: T) {
    onValueChange(getValue(item), item);
    setOpen(false);
    setQuery('');
  }

  function onKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, results.length - 1));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter') {
      event.preventDefault();
      const item = results[active];
      if (item) choose(item);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <PopoverTrigger asChild disabled={disabled}>
        <button
          type="button"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-label={ariaLabel}
          className={cn(
            'flex h-10 w-full items-center justify-between gap-2 rounded-lg border border-input bg-card px-3 text-start text-sm',
            'transition-colors focus-visible:border-ring focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/15',
            'disabled:cursor-not-allowed disabled:opacity-50',
            className,
          )}
        >
          <span className={cn('min-w-0 flex-1 truncate', !selected && 'text-muted-foreground')}>
            {selected ? getLabel(selected) : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[18rem]">
        <div className="flex items-center gap-2 border-b px-3">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
            placeholder={searchPlaceholder}
            aria-label={searchPlaceholder}
            aria-controls={listId}
            aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
            className="h-10 min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div ref={listRef} id={listId} role="listbox" className="scrollbar-thin max-h-72 overflow-y-auto p-1">
          {results.length === 0 ? (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">{emptyText}</p>
          ) : (
            results.map((item, index) => {
              const itemValue = getValue(item);
              const isSelected = itemValue === value;
              return (
                <div
                  key={itemValue}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={isSelected}
                  data-index={index}
                  onMouseEnter={() => setActive(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => choose(item)}
                  className={cn(
                    'flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-2 text-sm',
                    index === active && 'bg-accent text-accent-foreground',
                  )}
                >
                  <Check className={cn('h-4 w-4 shrink-0', isSelected ? 'opacity-100' : 'opacity-0')} />
                  <div className="min-w-0 flex-1">{renderItem ? renderItem(item) : getLabel(item)}</div>
                </div>
              );
            })
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
