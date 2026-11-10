import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  APP_SETTINGS,
  APP_SETTING_KEYS,
  appSettingValueSchema,
  type AppSettingDef,
  type AppSettingKey,
  type AppSettingSection,
  type AppSettingValue,
} from '@erp-platform/contracts';
import { Button, Input, Skeleton, Switch, Textarea, cn, toast, useFeatureChecker } from '@erp-platform/ui';
import { RotateCcw } from 'lucide-react';

import { useAppSettings, useUpdateAppSettings } from '../queries';
import { ApiError } from '../../../lib/api-client';
import { useSaveShortcut } from '../../../lib/use-save-shortcut';
import { SectionCard } from '../../../components/document/document-layout';

/** i18n key of a setting: 'security.lockoutMinutes' → settings.hub.items.security__lockoutMinutes */
export const settingI18nKey = (key: string) => `settings.hub.items.${key.replace(/\./g, '__')}`;

/** A pending change: a new value, or back to the default. */
type DraftEntry = { value: AppSettingValue } | { reset: true };
type Draft = Partial<Record<AppSettingKey, DraftEntry>>;
type T = (key: string, opts?: Record<string, unknown>) => string;

/**
 * Renders every APP_SETTINGS entry of one hub section from its definition, grouped under the
 * definition's `group` headings: a question with a one-line hint, the control (number with its
 * unit, switch, choices or text), a reset when it differs from the default, and one save bar that
 * appears only when something changed. Settings of an activity that is switched off are hidden.
 */
export function AppSettingsSection({ section, footer }: { section: AppSettingSection; footer?: ReactNode }) {
  const { t } = useTranslation();
  const hasFeature = useFeatureChecker();
  const { data: entries, isLoading } = useAppSettings();
  const update = useUpdateAppSettings();
  const [draft, setDraft] = useState<Draft>({});
  const keys = useMemo(
    () =>
      APP_SETTING_KEYS.filter((key) => {
        const def: AppSettingDef = APP_SETTINGS[key];
        return def.section === section && (!def.feature || hasFeature(def.feature));
      }),
    [section, hasFeature],
  );
  const groups = useMemo(() => {
    const out = new Map<string, AppSettingKey[]>();
    for (const key of keys) {
      const group = (APP_SETTINGS[key] as AppSettingDef).group ?? '';
      out.set(group, [...(out.get(group) ?? []), key]);
    }
    return [...out.entries()];
  }, [keys]);
  const current = useMemo(() => new Map((entries ?? []).map((entry) => [entry.key, entry])), [entries]);
  useEffect(() => setDraft({}), [entries]);

  const savedValue = (key: AppSettingKey): AppSettingValue => {
    const entry = current.get(key);
    return entry ? (entry.value as AppSettingValue) : APP_SETTINGS[key].default;
  };
  const valueOf = (key: AppSettingKey): AppSettingValue => {
    const entry = draft[key];
    if (!entry) return savedValue(key);
    return 'reset' in entry ? APP_SETTINGS[key].default : entry.value;
  };
  const isInvalid = (key: AppSettingKey) => !appSettingValueSchema(APP_SETTINGS[key]).safeParse(valueOf(key)).success;
  const dirty = Object.keys(draft).length > 0;
  const invalid = keys.some(isInvalid);

  function change(key: AppSettingKey, entry: DraftEntry) {
    setDraft((prev) => {
      const next = { ...prev };
      const effective = 'reset' in entry ? APP_SETTINGS[key].default : entry.value;
      const storedIsDefault = current.get(key)?.isDefault ?? true;
      // Back to what is saved: nothing to send (a reset of a stored value that equals the default still is one).
      if (effective === savedValue(key) && ('value' in entry || storedIsDefault)) delete next[key];
      else next[key] = entry;
      return next;
    });
  }

  async function save() {
    if (!dirty || invalid) return;
    const body: Record<string, AppSettingValue | { reset: true }> = {};
    for (const [key, entry] of Object.entries(draft) as [AppSettingKey, DraftEntry][]) {
      body[key] = 'reset' in entry ? { reset: true } : entry.value;
    }
    try {
      await update.mutateAsync(body);
      toast.success(t('settings.hub.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }
  useSaveShortcut(() => void save(), !dirty || invalid);

  if (isLoading) return <Skeleton className="h-48 w-full rounded-xl" />;

  return (
    <div className="grid gap-4">
      {groups.map(([group, groupKeys], index) => (
        <SectionCard
          key={group || 'main'}
          title={group ? t(`settings.hub.settingGroups.${group}.title`) : t(`settings.hub.sections.${section}.title`)}
          description={(group ? t(`settings.hub.settingGroups.${group}.hint`) : index === 0 ? t(`settings.hub.sections.${section}.hint`) : '') || undefined}
          flush
        >
          <ul className="divide-y">
            {groupKeys.map((key) => {
              const def: AppSettingDef = APP_SETTINGS[key];
              const value = valueOf(key);
              const label = t(`${settingI18nKey(key)}.label`);
              return (
                <li
                  key={key}
                  id={`setting-${key}`}
                  className={cn(
                    'grid gap-3 px-5 py-4',
                    def.kind === 'text' && def.multiline ? '' : 'sm:grid-cols-[1fr_auto] sm:items-center',
                    key in draft && 'bg-accent/30',
                  )}
                >
                  <div className="grid gap-1">
                    <span className="font-medium">{label}</span>
                    <span className="text-sm text-muted-foreground">{t(`${settingI18nKey(key)}.hint`)}</span>
                    {value !== def.default ? (
                      <button
                        type="button"
                        className="inline-flex w-fit items-center gap-1 text-xs text-primary hover:underline"
                        onClick={() => change(key, { reset: true })}
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t('settings.hub.resetTo', { value: formatValue(t, key, def, def.default) })}
                      </button>
                    ) : null}
                  </div>
                  <SettingControl
                    settingKey={key}
                    def={def}
                    value={value}
                    label={label}
                    invalid={isInvalid(key)}
                    onChange={(next) => change(key, { value: next })}
                  />
                </li>
              );
            })}
          </ul>
        </SectionCard>
      ))}
      {footer}

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

function choiceLabel(t: T, key: string, option: string): string {
  return t(`${settingI18nKey(key)}.choices.${option}`, { defaultValue: t(`settings.hub.choices.${option}`, { defaultValue: option }) });
}

function formatValue(t: T, key: string, def: AppSettingDef, value: AppSettingValue): string {
  if (def.kind === 'boolean') return value ? t('settings.hub.on') : t('settings.hub.off');
  if (def.kind === 'choice') return choiceLabel(t, key, String(value));
  if (def.kind === 'text') return value ? t('settings.hub.textValue') : t('settings.hub.empty');
  if (value === null) return t('settings.hub.noLimit');
  return def.unit ? `${value} ${t(`settings.hub.units.${def.unit}`)}` : String(value);
}

function SettingControl({
  settingKey,
  def,
  value,
  label,
  invalid,
  onChange,
}: {
  settingKey: string;
  def: AppSettingDef;
  value: AppSettingValue;
  label: string;
  invalid: boolean;
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
            {choiceLabel(t, settingKey, option)}
          </button>
        ))}
      </div>
    );
  }
  if (def.kind === 'text') {
    const text = typeof value === 'string' ? value : '';
    return (
      <div className="grid gap-1">
        {def.multiline ? (
          <Textarea rows={3} value={text} maxLength={def.maxLength} onChange={(e) => onChange(e.target.value)} aria-label={label} />
        ) : (
          <Input value={text} maxLength={def.maxLength} onChange={(e) => onChange(e.target.value)} aria-label={label} className="sm:w-72" />
        )}
        <span className="text-xs text-muted-foreground">
          {text.length}/{def.maxLength}
        </span>
      </div>
    );
  }
  const decimals = def.decimals ?? 0;
  return (
    <div className="grid gap-1">
      <div className="flex items-center gap-2">
        <Input
          type="number"
          inputMode={decimals ? 'decimal' : 'numeric'}
          min={def.min}
          max={def.max}
          step={decimals ? 1 / 10 ** decimals : 1}
          placeholder={def.nullable ? t('settings.hub.noLimit') : undefined}
          value={value === null || Number.isNaN(value as number) ? '' : String(value)}
          onChange={(e) => onChange(e.target.value === '' ? (def.nullable ? null : Number.NaN) : Number(e.target.value))}
          className={cn('w-28 tabular-nums', invalid && 'border-danger')}
          aria-label={label}
          aria-invalid={invalid}
        />
        {def.unit ? <span className="text-sm text-muted-foreground">{t(`settings.hub.units.${def.unit}`)}</span> : null}
      </div>
      <span className={cn('text-xs', invalid ? 'text-danger' : 'text-muted-foreground')}>
        {t(def.nullable ? 'settings.hub.rangeOrEmpty' : 'settings.hub.range', { min: def.min, max: def.max })}
      </span>
    </div>
  );
}
