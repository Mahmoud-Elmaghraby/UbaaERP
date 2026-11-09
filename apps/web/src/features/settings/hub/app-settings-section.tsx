import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  APP_SETTINGS,
  APP_SETTING_KEYS,
  type AppSettingDef,
  type AppSettingKey,
  type AppSettingSection,
  type AppSettingValue,
} from '@erp-platform/contracts';
import { Button, Input, Skeleton, Switch, cn, toast } from '@erp-platform/ui';
import { RotateCcw } from 'lucide-react';

import { useAppSettings, useUpdateAppSettings } from '../queries';
import { ApiError } from '../../../lib/api-client';
import { useSaveShortcut } from '../../../lib/use-save-shortcut';
import { SectionCard } from '../../../components/document/document-layout';

/** i18n key of a setting: 'security.lockoutMinutes' → settings.hub.items.security__lockoutMinutes */
export const settingI18nKey = (key: string) => `settings.hub.items.${key.replace(/\./g, '__')}`;

type Draft = Partial<Record<AppSettingKey, AppSettingValue | null>>;

/**
 * Renders every APP_SETTINGS entry of one hub section from its definition: a question with a
 * one-line hint, the control (number with its unit, switch, or choices), "different from default"
 * with a reset, and one save bar for the section that appears only when something changed.
 */
export function AppSettingsSection({ section }: { section: AppSettingSection }) {
  const { t } = useTranslation();
  const { data: entries, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [draft, setDraft] = useState<Draft>({});
  const keys = useMemo(() => APP_SETTING_KEYS.filter((key) => APP_SETTINGS[key].section === section), [section]);
  const current = useMemo(() => new Map((entries ?? []).map((entry) => [entry.key, entry])), [entries]);
  useEffect(() => setDraft({}), [entries]);

  const dirty = Object.keys(draft).length > 0;
  const valueOf = (key: AppSettingKey): AppSettingValue =>
    key in draft ? (draft[key] ?? APP_SETTINGS[key].default) : ((current.get(key)?.value as AppSettingValue | undefined) ?? APP_SETTINGS[key].default);
  const invalid = keys.some((key) => {
    const def: AppSettingDef = APP_SETTINGS[key];
    const value = valueOf(key);
    return def.kind === 'number' && (typeof value !== 'number' || !Number.isInteger(value) || value < def.min || value > def.max);
  });

  function change(key: AppSettingKey, value: AppSettingValue | null) {
    setDraft((prev) => {
      const next = { ...prev };
      const saved = current.get(key);
      const savedValue = saved ? saved.value : APP_SETTINGS[key].default;
      const effective = value ?? APP_SETTINGS[key].default;
      const resetsSavedDefault = value === null && saved?.isDefault;
      if (effective === savedValue && (value !== null || resetsSavedDefault)) delete next[key];
      else next[key] = value;
      return next;
    });
  }

  async function save() {
    if (!dirty || invalid) return;
    try {
      await update.mutateAsync(draft);
      toast.success(t('settings.hub.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }
  useSaveShortcut(() => void save(), !dirty || invalid);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  return (
    <div className="grid gap-4">
      <SectionCard title={t(`settings.hub.sections.${section}.title`)} description={t(`settings.hub.sections.${section}.hint`)} flush>
        <ul className="divide-y">
          {keys.map((key) => {
            const def: AppSettingDef = APP_SETTINGS[key];
            const value = valueOf(key);
            const isDefault = value === def.default;
            return (
              <li key={key} id={`setting-${key}`} className={cn('grid gap-3 px-5 py-4 sm:grid-cols-[1fr_auto] sm:items-center', key in draft && 'bg-accent/30')}>
                <div className="grid gap-1">
                  <span className="font-medium">{t(`${settingI18nKey(key)}.label`)}</span>
                  <span className="text-sm text-muted-foreground">{t(`${settingI18nKey(key)}.hint`)}</span>
                  {!isDefault ? (
                    <button
                      type="button"
                      className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                      onClick={() => change(key, null)}
                    >
                      <RotateCcw className="h-3 w-3" />
                      {t('settings.hub.resetTo', { value: formatValue(t, def, def.default) })}
                    </button>
                  ) : null}
                </div>
                <SettingControl def={def} value={value} label={t(`${settingI18nKey(key)}.label`)} onChange={(next) => change(key, next)} />
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {dirty ? (
        <div className="sticky bottom-4 z-10 flex items-center justify-between gap-3 rounded-xl border bg-card/95 px-4 py-3 shadow-card backdrop-blur">
          <span className="text-sm text-muted-foreground">
            {invalid ? t('settings.hub.fixInvalid') : t('settings.hub.unsaved', { count: Object.keys(draft).length })}
          </span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => setDraft({})} disabled={update.isPending}>
              {t('common.cancel')}
            </Button>
            <Button onClick={() => void save()} disabled={update.isPending || invalid}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function formatValue(t: (key: string, opts?: Record<string, unknown>) => string, def: AppSettingDef, value: AppSettingValue): string {
  if (def.kind === 'boolean') return value ? t('settings.hub.on') : t('settings.hub.off');
  if (def.kind === 'choice') return t(`settings.hub.choices.${String(value)}`, { defaultValue: String(value) });
  return def.unit ? `${value} ${t(`settings.hub.units.${def.unit}`)}` : String(value);
}

function SettingControl({
  def,
  value,
  label,
  onChange,
}: {
  def: AppSettingDef;
  value: AppSettingValue;
  label: string;
  onChange: (value: AppSettingValue) => void;
}) {
  const { t } = useTranslation();
  if (def.kind === 'boolean') {
    return <Switch checked={value === true} onCheckedChange={onChange} aria-label={label} />;
  }
  if (def.kind === 'choice') {
    return (
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1 rounded-lg bg-muted p-1">
        {def.options.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={value === option}
            onClick={() => onChange(option)}
            className={cn(
              'rounded-md px-3 py-1 text-sm font-medium transition-colors',
              value === option ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {t(`settings.hub.choices.${option}`, { defaultValue: option })}
          </button>
        ))}
      </div>
    );
  }
  const outOfRange = typeof value !== 'number' || value < def.min || value > def.max;
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode="numeric"
          min={def.min}
          max={def.max}
          value={Number.isNaN(value as number) ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? Number.NaN : Number(e.target.value))}
          className={cn('w-28 tabular-nums', outOfRange && 'border-danger')}
          aria-label={label}
          aria-invalid={outOfRange}
        />
        {def.unit ? <span className="text-sm text-muted-foreground">{t(`settings.hub.units.${def.unit}`)}</span> : null}
      </div>
      <span className={cn('text-xs', outOfRange ? 'text-danger' : 'text-muted-foreground')}>
        {t('settings.hub.range', { min: def.min, max: def.max })}
      </span>
    </div>
  );
}
