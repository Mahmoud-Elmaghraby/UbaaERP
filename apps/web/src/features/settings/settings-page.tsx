import { useMemo, useState } from 'react';
import { Link, Navigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { EmptyState, Input, PageHeader, cn } from '@erp-platform/ui';
import { ArrowUpLeft, ChevronRight, Search, SearchX } from 'lucide-react';

import { LEGACY_TABS, SETTINGS_GROUPS } from './hub/settings-sections';
import { matchesSearch, useSettingsSections, type VisibleSection } from './hub/use-settings-sections';

const HUB = '/settings';

/**
 * مركز الإعدادات (claude doc "مسح شامل للإعدادات", phase 1): /settings is a searchable home of
 * cards grouped as Organization · Documents & printing · Modules · System; /settings/:section shows
 * one section beside a sidebar of all of them. Old /settings?tab=x links land on the new section.
 */
export function SettingsPage() {
  const { section } = useParams<{ section?: string }>();
  const [params] = useSearchParams();
  const legacy = params.get('tab');
  if (!section && legacy) return <Navigate to={`${HUB}/${LEGACY_TABS[legacy] ?? legacy}`} replace />;
  return section ? <SettingsSectionPage id={section} /> : <SettingsHome />;
}

function SettingsHome() {
  const { t } = useTranslation();
  const sections = useSettingsSections();
  const [query, setQuery] = useState('');
  const visible = useMemo(() => sections.filter((s) => matchesSearch(s, query)), [sections, query]);

  return (
    <div className="grid gap-6">
      <PageHeader title={t('settings.title')} description={t('settings.hub.description')} />
      <div className="relative max-w-xl">
        <Search className="pointer-events-none absolute inset-y-0 start-3 my-auto h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('settings.hub.search')}
          className="h-11 ps-9"
          aria-label={t('settings.hub.search')}
        />
      </div>
      {visible.length === 0 ? (
        <EmptyState icon={<SearchX />} title={t('settings.hub.noMatch')} />
      ) : (
        SETTINGS_GROUPS.map((group) => {
          const items = visible.filter((s) => s.group === group);
          if (items.length === 0) return null;
          return (
            <section key={group} className="grid gap-3">
              <h2 className="text-sm font-semibold text-muted-foreground">{t(`settings.hub.groups.${group}`)}</h2>
              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {items.map((s) => (
                  <SectionCardLink key={s.id} section={s} />
                ))}
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}

function SectionCardLink({ section }: { section: VisibleSection }) {
  const Icon = section.icon;
  return (
    <Link
      to={section.to ?? `${HUB}/${section.id}`}
      className="group flex gap-3 rounded-xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 hover:bg-accent/40"
    >
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent text-accent-foreground group-hover:bg-primary group-hover:text-primary-foreground">
        <Icon className="h-5 w-5" />
      </span>
      <span className="grid min-w-0 gap-0.5">
        <span className="flex items-center gap-1 font-medium">
          {section.title}
          {section.to ? <ArrowUpLeft className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" /> : null}
        </span>
        <span className="line-clamp-2 text-sm text-muted-foreground">{section.hint}</span>
      </span>
    </Link>
  );
}

function SettingsSectionPage({ id }: { id: string }) {
  const { t } = useTranslation();
  const sections = useSettingsSections();
  const [query, setQuery] = useState('');
  const current = sections.find((s) => s.id === id);
  const navItems = useMemo(() => sections.filter((s) => matchesSearch(s, query)), [sections, query]);

  if (!current) return <Navigate to={HUB} replace />;
  if (current.to) return <Navigate to={current.to} replace />;
  const Body = current.component!;

  return (
    <div className="grid gap-6 lg:grid-cols-[240px_1fr]">
      <aside className="lg:sticky lg:top-20 lg:self-start">
        <nav aria-label={t('settings.title')} className="grid gap-4 rounded-xl border bg-card p-3 shadow-card">
          <Link to={HUB} className="flex items-center gap-1 px-2 text-sm font-semibold hover:text-primary">
            <ChevronRight className="h-4 w-4" />
            {t('settings.title')}
          </Link>
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('settings.hub.searchShort')} className="h-8" />
          {SETTINGS_GROUPS.map((group) => {
            const items = navItems.filter((s) => s.group === group);
            if (items.length === 0) return null;
            return (
              <div key={group} className="grid gap-0.5">
                <span className="px-2 text-xs font-semibold text-muted-foreground">{t(`settings.hub.groups.${group}`)}</span>
                {items.map((s) => {
                  const Icon = s.icon;
                  return (
                    <Link
                      key={s.id}
                      to={s.to ?? `${HUB}/${s.id}`}
                      aria-current={s.id === id ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors',
                        s.id === id ? 'bg-accent font-medium text-accent-foreground' : 'text-secondary-foreground hover:bg-muted',
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span className="truncate">{s.title}</span>
                      {s.to ? <ArrowUpLeft className="ms-auto h-3 w-3 text-muted-foreground" aria-hidden="true" /> : null}
                    </Link>
                  );
                })}
              </div>
            );
          })}
        </nav>
      </aside>
      <div className="grid min-w-0 content-start gap-5">
        <PageHeader title={current.title} description={current.hint} />
        <Body />
      </div>
    </div>
  );
}
