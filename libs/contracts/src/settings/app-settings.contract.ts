import { z } from 'zod';

/**
 * The central settings registry (settings hub, 2026-11-09). Every tenant-wide option that isn't a
 * whole table of its own (branches, taxes, numbering…) is declared here ONCE: its key, kind, limits,
 * default and the hub section it shows in. The API validates and stores values (app_settings,
 * migration 0119) and the web renders the controls from this same list, so adding an option is one
 * entry here plus the code that reads it. The default is always today's behaviour, so a new option
 * never changes anything until someone sets it.
 */
export type AppSettingSection = 'security';

interface BaseDef {
  section: AppSettingSection;
}
export interface NumberSettingDef extends BaseDef {
  kind: 'number';
  default: number;
  min: number;
  max: number;
  /** Shown after the field ("دقيقة", "%"…): an i18n key under settings.hub.units. */
  unit?: string;
}
export interface BooleanSettingDef extends BaseDef {
  kind: 'boolean';
  default: boolean;
}
export interface ChoiceSettingDef extends BaseDef {
  kind: 'choice';
  default: string;
  options: readonly string[];
}
export type AppSettingDef = NumberSettingDef | BooleanSettingDef | ChoiceSettingDef;

export const APP_SETTINGS = {
  'security.lockoutMaxAttempts': { section: 'security', kind: 'number', default: 5, min: 3, max: 20 },
  'security.lockoutMinutes': { section: 'security', kind: 'number', default: 15, min: 1, max: 1440, unit: 'minutes' },
} as const satisfies Record<string, AppSettingDef>;

export type AppSettingKey = keyof typeof APP_SETTINGS;
export type AppSettingValue = number | boolean | string;

export const APP_SETTING_KEYS = Object.keys(APP_SETTINGS) as AppSettingKey[];

/** The zod schema of one setting's value, built from its definition. */
export function appSettingValueSchema(def: AppSettingDef): z.ZodType<AppSettingValue> {
  switch (def.kind) {
    case 'number':
      return z.number().int().min(def.min).max(def.max);
    case 'boolean':
      return z.boolean();
    case 'choice':
      return z.enum(def.options as unknown as [string, ...string[]]);
  }
}

/** GET /app-settings — every setting with its current value (the default when never set). */
export const appSettingEntrySchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.boolean(), z.string()]),
  isDefault: z.boolean(),
  updatedAt: z.coerce.date().nullable(),
});
export type AppSettingEntryDto = z.infer<typeof appSettingEntrySchema>;

/** PATCH /app-settings — any subset; `null` puts a setting back to its default. */
export const updateAppSettingsSchema = z.record(z.union([z.number(), z.boolean(), z.string(), z.null()]));
export type UpdateAppSettingsDto = z.infer<typeof updateAppSettingsSchema>;
