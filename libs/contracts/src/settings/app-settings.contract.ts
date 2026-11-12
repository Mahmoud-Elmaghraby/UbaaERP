import { z } from 'zod';

/**
 * The central settings registry (settings hub, 2026-11-09). Every tenant-wide option that isn't a
 * whole table of its own (branches, taxes, numbering…) is declared here ONCE: its key, kind, limits,
 * default and the hub section it shows in. The API validates and stores values (app_settings,
 * migration 0119) and the web renders the controls from this same list, so adding an option is one
 * entry here plus the code that reads it. The default is always today's behaviour, so a new option
 * never changes anything until someone sets it.
 */
export type AppSettingSection = 'security' | 'sales' | 'pos' | 'purchases' | 'documents' | 'hr';

/**
 * Who may change a section's settings (any one of the keys). Reading is open to every signed-in
 * user: the screens that apply a setting (POS, document editors) need its value.
 */
export const APP_SETTING_SECTION_PERMISSIONS: Record<AppSettingSection, readonly string[]> = {
  security: ['settings.manage'],
  documents: ['settings.manage'],
  sales: ['settings.manage', 'sales.settings.manage'],
  pos: ['settings.manage', 'sales.settings.manage'],
  purchases: ['settings.manage', 'purchases.settings.manage'],
  hr: ['settings.manage', 'hr.salaries.manage', 'hr.attendance.manage'],
};

interface BaseDef {
  section: AppSettingSection;
  /** Only meaningful while this activity switch is on (hidden in the hub otherwise). */
  feature?: string;
  /** A heading inside the section (i18n settings.hub.groups.<group>); settings without one come first. */
  group?: string;
}
export interface NumberSettingDef extends BaseDef {
  kind: 'number';
  /** `null` = no limit (only with `nullable`). */
  default: number | null;
  min: number;
  max: number;
  /** Empty means "no limit" (the value is null). */
  nullable?: boolean;
  /** Digits after the decimal point (0 = whole numbers, the default). */
  decimals?: number;
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
export interface TextSettingDef extends BaseDef {
  kind: 'text';
  default: string;
  maxLength: number;
  multiline?: boolean;
}
export type AppSettingDef = NumberSettingDef | BooleanSettingDef | ChoiceSettingDef | TextSettingDef;

/** allow / warn (the screen asks first) / block (unless the user may override). */
export const RULE_MODES = ['allow', 'warn', 'block'] as const;
export type RuleMode = (typeof RULE_MODES)[number];
/** POS cash rounding step, rounded down (a small discount, never extra revenue). */
export const CASH_ROUNDING_STEPS = { none: 0, quarter: 0.25, half: 0.5, one: 1 } as const;
export type CashRounding = keyof typeof CASH_ROUNDING_STEPS;

export const APP_SETTINGS = {
  'security.lockoutMaxAttempts': { section: 'security', kind: 'number', default: 5, min: 3, max: 20 },
  'security.lockoutMinutes': { section: 'security', kind: 'number', default: 15, min: 1, max: 1440, unit: 'minutes' },

  // Sales (settings hub phase 2). Moved here from tenant_settings: creditLimitMode (0109).
  'sales.maxDiscountPercent': { section: 'sales', group: 'pricing', kind: 'number', default: null, nullable: true, min: 0, max: 100, decimals: 2, unit: 'percent' },
  'sales.belowCostMode': { section: 'sales', group: 'pricing', kind: 'choice', default: 'allow', options: RULE_MODES },
  'sales.belowMinPriceMode': { section: 'sales', group: 'pricing', kind: 'choice', default: 'allow', options: RULE_MODES },
  'sales.creditLimitMode': { section: 'sales', group: 'credit', kind: 'choice', default: 'off', options: ['off', 'warn', 'block'] },
  'sales.returnWindowDays': { section: 'sales', group: 'returns', kind: 'number', default: null, nullable: true, min: 1, max: 3650, unit: 'days' },
  'sales.repRequired': { section: 'sales', group: 'documents', kind: 'boolean', default: false, feature: 'sales.reps' },
  'sales.prefillWalkInCustomer': { section: 'sales', group: 'documents', kind: 'boolean', default: false },
  'sales.defaultInvoiceNotes': { section: 'sales', group: 'documents', kind: 'text', default: '', maxLength: 1000, multiline: true },
  'sales.defaultQuotationTerms': { section: 'sales', group: 'documents', kind: 'text', default: '', maxLength: 2000, multiline: true },

  // POS. Moved here from tenant_settings: posMaxDiscountPercent (0113).
  'pos.maxDiscountPercent': { section: 'pos', group: 'checkout', feature: 'pos', kind: 'number', default: null, nullable: true, min: 0, max: 100, decimals: 2, unit: 'percent' },
  'pos.cashRounding': { section: 'pos', group: 'checkout', feature: 'pos', kind: 'choice', default: 'none', options: ['none', 'quarter', 'half', 'one'] },
  'pos.autoPrintReceipt': { section: 'pos', group: 'receipt', feature: 'pos', kind: 'boolean', default: false },
  // Logo, footer and the rest of the receipt's look live in the print template (sales_invoice, 80 mm).
  'pos.receiptShowCashier': { section: 'pos', group: 'receipt', feature: 'pos', kind: 'boolean', default: false },

  // Purchases (settings hub phase 3). 'purchases.approve' (migration 0121) confirms big orders and passes a price block.
  'purchases.orderApprovalAmount': { section: 'purchases', group: 'approval', kind: 'number', default: null, nullable: true, min: 0, max: 999_999_999, decimals: 2, unit: 'companyCurrency' },
  'purchases.priceIncreaseMode': { section: 'purchases', group: 'purchasePricing', kind: 'choice', default: 'allow', options: RULE_MODES },
  'purchases.priceIncreaseTolerancePercent': { section: 'purchases', group: 'purchasePricing', kind: 'number', default: 0, min: 0, max: 1000, decimals: 2, unit: 'percent' },
  'purchases.overReceiptTolerancePercent': { section: 'purchases', group: 'receiving', kind: 'number', default: 0, min: 0, max: 100, decimals: 2, unit: 'percent' },
  'purchases.supplierInvoiceNumberRequired': { section: 'purchases', group: 'documents', kind: 'boolean', default: false },
  'purchases.defaultOrderNotes': { section: 'purchases', group: 'documents', kind: 'text', default: '', maxLength: 2000, multiline: true },

  // HR (migration 0125). The day rate turns a monthly salary into a day's pay (absence, overtime).
  'hr.dayRateBasis': { section: 'hr', group: 'hrPay', feature: 'hr', kind: 'choice', default: 'days30', options: ['days30', 'days26', 'workingDays'] },
  'hr.overtimeMultiplier': { section: 'hr', group: 'hrPay', feature: 'hr', kind: 'number', default: 1.5, min: 1, max: 5, decimals: 2 },
  'hr.minOvertimeMinutes': { section: 'hr', group: 'hrAttendance', feature: 'hr', kind: 'number', default: 30, min: 0, max: 480, unit: 'minutes' },

  // Document dates, every module.
  'documents.backdateDays': { section: 'documents', kind: 'number', default: null, nullable: true, min: 0, max: 3650, unit: 'days' },
  'documents.allowFutureDates': { section: 'documents', kind: 'boolean', default: true },
} as const satisfies Record<string, AppSettingDef>;

export type AppSettingKey = keyof typeof APP_SETTINGS;
export type AppSettingValue = number | boolean | string | null;
/** The runtime type of one setting's value. */
export type AppSettingValueOf<K extends AppSettingKey> = (typeof APP_SETTINGS)[K] extends { kind: 'number'; nullable: true }
  ? number | null
  : (typeof APP_SETTINGS)[K] extends { kind: 'number' }
    ? number
    : (typeof APP_SETTINGS)[K] extends { kind: 'boolean' }
      ? boolean
      : (typeof APP_SETTINGS)[K] extends { kind: 'choice'; options: readonly (infer O)[] }
        ? O
        : string;

export const APP_SETTING_KEYS = Object.keys(APP_SETTINGS) as AppSettingKey[];

/** The zod schema of one setting's value, built from its definition. */
export function appSettingValueSchema(def: AppSettingDef): z.ZodType<AppSettingValue> {
  switch (def.kind) {
    case 'number': {
      const factor = 10 ** (def.decimals ?? 0);
      const n = z
        .number()
        .min(def.min)
        .max(def.max)
        .refine((v) => Math.abs(Math.round(v * factor) - v * factor) < 1e-6, { message: 'too many decimals' });
      return (def.nullable ? n.nullable() : n) as z.ZodType<AppSettingValue>;
    }
    case 'text':
      return z.string().max(def.maxLength);
    case 'boolean':
      return z.boolean();
    case 'choice':
      return z.enum(def.options as unknown as [string, ...string[]]);
  }
}

/** GET /app-settings — every setting with its current value (the default when never set). */
export const appSettingEntrySchema = z.object({
  key: z.string(),
  value: z.union([z.number(), z.boolean(), z.string(), z.null()]),
  isDefault: z.boolean(),
  updatedAt: z.coerce.date().nullable(),
});
export type AppSettingEntryDto = z.infer<typeof appSettingEntrySchema>;

/**
 * PATCH /app-settings — any subset. `{ reset: true }` puts a setting back to its default (a plain
 * `null` is a value: "no limit" for a nullable number).
 */
export const updateAppSettingsSchema = z.record(z.union([z.number(), z.boolean(), z.string(), z.null(), z.object({ reset: z.literal(true) })]));
export type UpdateAppSettingsDto = z.infer<typeof updateAppSettingsSchema>;
