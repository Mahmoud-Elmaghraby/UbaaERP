import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { updateAccountingSettingsSchema, type UpdateAccountingSettingsDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Checkbox,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Skeleton,
  toast,
  PageHeader,
} from '@erp-platform/ui';

import { X } from 'lucide-react';

import { useAccountingSettings, useUpdateAccountingSettings } from '../../api/accounting-settings/queries';
import { AccountPicker } from '../account-picker';
import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { ApiError } from '../../../../lib/api-client';

type MappingName = Exclude<keyof UpdateAccountingSettingsDto, 'requireEntryApproval' | 'reviewAutoEntries'>;

/** Grouped the way an accountant thinks about them; every mapping the auto-posting listeners read. */
const MAPPING_GROUPS: { titleKey: string; fields: { name: MappingName; labelKey: string }[] }[] = [
  {
    titleKey: 'accounting.settings.groups.sales',
    fields: [
      { name: 'accountsReceivableAccountId', labelKey: 'accounting.settings.accountsReceivable' },
      { name: 'revenueAccountId', labelKey: 'accounting.settings.revenue' },
      { name: 'salesReturnsContraAccountId', labelKey: 'accounting.settings.salesReturnsContra' },
    ],
  },
  {
    titleKey: 'accounting.settings.groups.purchases',
    fields: [
      { name: 'accountsPayableAccountId', labelKey: 'accounting.settings.accountsPayable' },
      { name: 'grniAccountId', labelKey: 'accounting.settings.grni' },
      { name: 'purchaseExpenseAccountId', labelKey: 'accounting.settings.purchaseExpense' },
      { name: 'landedCostClearingAccountId', labelKey: 'accounting.settings.landedCostClearing' },
    ],
  },
  {
    titleKey: 'accounting.settings.groups.inventory',
    fields: [
      { name: 'inventoryAccountId', labelKey: 'accounting.settings.inventory' },
      { name: 'cogsAccountId', labelKey: 'accounting.settings.cogs' },
      { name: 'inventoryAdjustmentAccountId', labelKey: 'accounting.settings.inventoryAdjustment' },
      { name: 'openingBalanceEquityAccountId', labelKey: 'accounting.settings.openingBalanceEquity' },
    ],
  },
  {
    titleKey: 'accounting.settings.groups.taxes',
    fields: [
      { name: 'vatOutputAccountId', labelKey: 'accounting.settings.vatOutput' },
      { name: 'vatInputAccountId', labelKey: 'accounting.settings.vatInput' },
      { name: 'tableTaxOutputAccountId', labelKey: 'accounting.settings.tableTaxOutput' },
      { name: 'tableTaxInputAccountId', labelKey: 'accounting.settings.tableTaxInput' },
      { name: 'withholdingPayableAccountId', labelKey: 'accounting.settings.withholdingPayable' },
      { name: 'withholdingReceivableAccountId', labelKey: 'accounting.settings.withholdingReceivable' },
    ],
  },
  {
    titleKey: 'accounting.settings.groups.cash',
    fields: [
      { name: 'notesReceivableAccountId', labelKey: 'accounting.settings.notesReceivable' },
      { name: 'notesPayableAccountId', labelKey: 'accounting.settings.notesPayable' },
      { name: 'cashAccountId', labelKey: 'accounting.settings.cash' },
      { name: 'defaultBankAccountId', labelKey: 'accounting.settings.defaultBank' },
      { name: 'cashOverShortAccountId', labelKey: 'accounting.settings.cashOverShort' },
      { name: 'exchangeGainLossAccountId', labelKey: 'accounting.settings.exchangeGainLoss' },
    ],
  },  {
    titleKey: 'accounting.settings.groups.payroll',
    fields: [
      { name: 'salariesExpenseAccountId', labelKey: 'accounting.settings.salariesExpense' },
      { name: 'salariesPayableAccountId', labelKey: 'accounting.settings.salariesPayable' },
      { name: 'employeeAdvancesAccountId', labelKey: 'accounting.settings.employeeAdvances' },
    ],
  },

  {
    titleKey: 'accounting.settings.groups.closing',
    fields: [{ name: 'retainedEarningsAccountId', labelKey: 'accounting.settings.retainedEarnings' }],
  },
];

const MAPPING_FIELDS = MAPPING_GROUPS.flatMap((group) => group.fields);

/** Review controls (not account mappings): who may post, and whether automatic entries wait for review. */
const CONTROL_FIELDS = [
  { name: 'requireEntryApproval', labelKey: 'accounting.settings.requireEntryApproval' },
  { name: 'reviewAutoEntries', labelKey: 'accounting.settings.reviewAutoEntries' },
] as const;
const CONTROLS_ID = 'accounting.settings.groups.controls';

function formValues(settings: Partial<Record<string, unknown>> | undefined): UpdateAccountingSettingsDto {
  return {
    ...Object.fromEntries(MAPPING_FIELDS.map(({ name }) => [name, settings?.[name] ?? null])),
    ...Object.fromEntries(CONTROL_FIELDS.map(({ name }) => [name, settings?.[name] ?? false])),
  } as UpdateAccountingSettingsDto;
}

/**
 * GET+PATCH singleton, same shape as Sales' EtaCredentialsPage / Settings' GeneralTab
 * — this is the account mapping AccountingAutoPostingListeners reads to know which
 * leaf account to post to for COGS/sales-return auto-posting (Stage 6/7) and now
 * also Sales/Purchases invoice auto-posting (Stage 3) — see
 * claude/accounting-module-status.md. getOrCreate() on the backend auto-populates
 * most of these from the default template's known codes on first read, so most
 * fields usually already have a value — this screen lets a tenant admin repoint any
 * of them if their chart of accounts diverges from the default. purchaseExpenseAccountId
 * is the one exception: it is never auto-populated (no generic "purchases expense"
 * leaf account exists in the seeded template), so it always starts unset here and
 * must be picked by hand before purchase-invoice auto-posting will work.
 */
export function AccountingSettingsPage() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useAccountingSettings();
  const postableAccounts = usePostableAccounts();
  const updateSettings = useUpdateAccountingSettings();

  const form = useForm<UpdateAccountingSettingsDto>({
    resolver: zodResolver(updateAccountingSettingsSchema),
    defaultValues: formValues(undefined),
  });

  useEffect(() => {
    if (settings) {
      form.reset(formValues(settings));
    }
  }, [settings, form]);

  async function onSubmit(values: UpdateAccountingSettingsDto) {
    try {
      await updateSettings.mutateAsync(values);
      toast.success(t('accounting.settings.saveSuccess'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('accounting.settings.saveError'));
    }
  }

  const dirty = form.formState.isDirty;

  return (
    <div className="grid gap-6 pb-20">
      <PageHeader title={t('accounting.tabs.settings')} description={t('accounting.settings.description')} />

      {isLoading ? (
        <Skeleton className="h-96 w-full rounded-xl" />
      ) : (
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-6 lg:grid-cols-[200px_minmax(0,1fr)]">
            <nav className="hidden lg:block">
              <ul className="sticky top-24 flex flex-col gap-1 text-sm">
                <li>
                  <a href={`#${CONTROLS_ID}`} className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
                    {t(CONTROLS_ID)}
                  </a>
                </li>
                {MAPPING_GROUPS.map((group) => (
                  <li key={group.titleKey}>
                    <a
                      href={`#${group.titleKey}`}
                      className="block rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      {t(group.titleKey)}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
            <div className="grid gap-5">
              <section id={CONTROLS_ID} className="scroll-mt-24 overflow-hidden rounded-xl border bg-card">
                <h2 className="border-b px-5 py-3 text-base font-semibold">{t(CONTROLS_ID)}</h2>
                <div className="divide-y">
                  {CONTROL_FIELDS.map(({ name, labelKey }) => (
                    <FormField
                      key={name}
                      control={form.control}
                      name={name}
                      render={({ field }) => (
                        <FormItem className="flex items-start gap-3 space-y-0 px-5 py-4">
                          <FormControl>
                            <Checkbox className="mt-0.5" checked={field.value === true} onCheckedChange={(v) => field.onChange(v === true)} />
                          </FormControl>
                          <div className="grid gap-0.5">
                            <FormLabel>{t(labelKey)}</FormLabel>
                            <FormDescription className="text-xs">{t(`${labelKey}Description`)}</FormDescription>
                          </div>
                        </FormItem>
                      )}
                    />
                  ))}
                </div>
              </section>
              {MAPPING_GROUPS.map((group) => (
                <section key={group.titleKey} id={group.titleKey} className="scroll-mt-24 overflow-hidden rounded-xl border bg-card">
                  <h2 className="border-b px-5 py-3 text-base font-semibold">{t(group.titleKey)}</h2>
                  <div className="divide-y">
                    {group.fields.map(({ name, labelKey }) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,1fr)_minmax(0,320px)] sm:items-center sm:gap-6">
                            <div className="grid gap-0.5">
                              <FormLabel>{t(labelKey)}</FormLabel>
                              <FormDescription className="text-xs">{t(`${labelKey}Description`)}</FormDescription>
                            </div>
                            <div className="flex items-center gap-1">
                              <FormControl>
                                <AccountPicker
                                  className="h-9 w-full"
                                  accounts={postableAccounts}
                                  value={field.value ?? null}
                                  placeholder={t('accounting.settings.noAccount')}
                                  onChange={(id) => field.onChange(id)}
                                />
                              </FormControl>
                              {field.value ? (
                                <Button type="button" variant="ghost" size="icon-sm" aria-label={t('accounting.settings.noAccount')} onClick={() => field.onChange(null)}>
                                  <X className="h-4 w-4" />
                                </Button>
                              ) : null}
                            </div>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
            <Can permission="accounting.manage">
              <div
                className={`fixed inset-x-0 bottom-0 z-30 border-t bg-card/95 px-4 py-3 backdrop-blur transition-transform md:ps-72 ${dirty ? 'translate-y-0' : 'translate-y-full'}`}
              >
                <div className="mx-auto flex max-w-[1440px] items-center justify-end gap-3">
                  <span className="text-sm text-muted-foreground">{t('common.unsavedChanges')}</span>
                  <Button type="button" variant="outline" onClick={() => settings && form.reset(formValues(settings))}>
                    {t('common.cancel')}
                  </Button>
                  <Button type="submit" disabled={updateSettings.isPending}>
                    {t('common.save')}
                  </Button>
                </div>
              </div>
            </Can>
          </form>
        </Form>
      )}
    </div>
  );
}
