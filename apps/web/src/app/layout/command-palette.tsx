import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { hasAny } from '../../lib/permissions';
import { Dialog, DialogContent, DialogTitle, cn, useFeatureChecker, usePermissions } from '@erp-platform/ui';
import { CornerDownLeft, Search } from 'lucide-react';

import { NAV_ITEMS } from './nav-items';

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface Destination {
  to: string;
  label: string;
  section?: string;
}

/** Normalizes Arabic letter variants so "اذن" matches "إذن", "فاتوره" matches "فاتورة", etc. */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[إأآ]/g, 'ا')
    .replace(/ة/g, 'ه')
    .replace(/ى/g, 'ي')
    .replace(/[ً-ْ]/g, '');
}

/**
 * Ctrl+K quick navigation to any screen the user is allowed to see. Same permission
 * source as <Can> (usePermissions from the shared PermissionsProvider) — this only
 * hides destinations; the API still enforces every permission server-side.
 */
export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const permissions = usePermissions();
  const hasFeature = useFeatureChecker();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  const destinations = useMemo<Destination[]>(() => {
    const result: Destination[] = [];
    for (const item of NAV_ITEMS) {
      if (!hasAny(permissions, item.permission)) continue;
      if (item.feature && !hasFeature(item.feature)) continue;
      const section = t(item.labelKey);
      if (item.children?.length) {
        for (const child of item.children) {
          if (child.feature && !hasFeature(child.feature)) continue;
          if (!hasAny(permissions, child.permission)) continue;
          result.push({ to: child.to, label: t(child.labelKey), section });
        }
      } else {
        result.push({ to: item.to, label: section });
      }
    }
    result.push({ to: '/profile', label: t('profile.title') });
    return result;
  }, [permissions, hasFeature, t]);

  const results = useMemo(() => {
    const q = normalize(query.trim());
    if (!q) return destinations;
    return destinations.filter((d) => normalize(`${d.label} ${d.section ?? ''}`).includes(q));
  }, [destinations, query]);

  useEffect(() => {
    if (!open) setQuery('');
  }, [open]);

  useEffect(() => setActiveIndex(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function go(destination: Destination | undefined) {
    if (!destination) return;
    onOpenChange(false);
    navigate(destination.to);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15vh] max-w-xl translate-y-0 gap-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">{t('shell.search')}</DialogTitle>
        <div className="flex items-center gap-3 border-b px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
          <input
            autoFocus
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') {
                event.preventDefault();
                setActiveIndex((i) => Math.min(i + 1, results.length - 1));
              } else if (event.key === 'ArrowUp') {
                event.preventDefault();
                setActiveIndex((i) => Math.max(i - 1, 0));
              } else if (event.key === 'Enter') {
                event.preventDefault();
                go(results[activeIndex]);
              }
            }}
            placeholder={t('shell.searchPlaceholder')}
            aria-label={t('shell.searchPlaceholder')}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
        </div>
        <ul ref={listRef} className="scrollbar-thin max-h-80 overflow-y-auto p-2" role="listbox">
          {results.length === 0 ? (
            <li className="px-3 py-8 text-center text-sm text-muted-foreground">{t('shell.searchEmpty')}</li>
          ) : (
            results.map((destination, index) => (
              <li key={destination.to} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  data-active={index === activeIndex}
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => go(destination)}
                  className={cn(
                    'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-start text-sm',
                    index === activeIndex ? 'bg-accent text-accent-foreground' : 'text-foreground',
                  )}
                >
                  <span className="flex-1 truncate font-medium">{destination.label}</span>
                  {destination.section ? (
                    <span className="truncate text-xs text-muted-foreground">{destination.section}</span>
                  ) : null}
                  {index === activeIndex ? (
                    <CornerDownLeft className="h-3.5 w-3.5 shrink-0 opacity-60" />
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="border-t bg-subtle px-4 py-2 text-xs text-muted-foreground">
          {t('shell.searchHint')}
        </div>
      </DialogContent>
    </Dialog>
  );
}
