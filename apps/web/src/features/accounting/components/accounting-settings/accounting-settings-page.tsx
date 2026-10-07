import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { updateAccountingSettingsSchema, type UpdateAccountingSettingsDto } from '@erp-platform/contracts';
import {
  Button,
  Can,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
  PageHeader,
} from '@erp-platform/ui';

import { useAccountingSettings, useUpdateAccountingSettings } from '../../api/accounting-settings/queries';
import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { ApiError } from '../../../../lib/api-client';

const NONE = '__none__';

type MappingName = keyof UpdateAccountingSettingsDto;

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
      { name: 'cashAccountId', labelKey: 'accounting.settings.cash' },
      { name: 'defaultBankAccountId', labelKey: 'accounting.settings.defaultBank' },
      { name: 'cashOverShortAccountId', labelKey: 'accounting.settings.cashOverShort' },
      { name: 'exchangeGainLossAccountId', labelKey: 'accounting.settings.exchangeGainLoss' },
    ],
  },
];

const MAPPING_FIELDS = MAPPING_GROUPS.flatMap((group) => group.fields);

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
    defaultValues: Object.fromEntries(MAPPING_FIELDS.map(({ name }) => [name, null])) as UpdateAccountingSettingsDto,
  });

  useEffect(() => {
    if (settings) {
      form.reset(
        Object.fromEntries(MAPPING_FIELDS.map(({ name }) => [name, settings[name] ?? null])) as UpdateAccountingSettingsDto,
      );
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

  return (
    <div className="grid gap-6">
      <PageHeader title={t('accounting.tabs.settings')} />

      <Card className="max-w-2xl">
        <CardHeader>
          <CardTitle>{t('accounting.settings.title')}</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <Skeleton className="h-64 w-full" />
          ) : (
            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
                <p className="text-sm text-muted-foreground">{t('accounting.settings.description')}</p>
                {MAPPING_GROUPS.map((group) => (
                  <fieldset key={group.titleKey} className="grid gap-4 rounded-lg border p-4">
                    <legend className="px-1 text-sm font-semibold">{t(group.titleKey)}</legend>
                    {group.fields.map(({ name, labelKey }) => (
                      <FormField
                        key={name}
                        control={form.control}
                        name={name}
                        render={({ field }) => (
                          <FormItem>
                            <FormLabel>{t(labelKey)}</FormLabel>
                            <Select
                              value={field.value ?? NONE}
                              onValueChange={(value) => field.onChange(value === NONE ? null : value)}
                            >
                              <FormControl>
                                <SelectTrigger>
                                  <SelectValue />
                                </SelectTrigger>
                              </FormControl>
                              <SelectContent>
                                <SelectItem value={NONE}>{t('accounting.settings.noAccount')}</SelectItem>
                                {postableAccounts.map((account) => (
                                  <SelectItem key={account.id} value={account.id}>
                                    {account.code} — {account.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                            <FormDescription>{t(`${labelKey}Description`)}</FormDescription>
                            <FormMessage />
                          </FormItem>
                        )}
                      />
                    ))}
                  </fieldset>
                ))}
                <Can permission="accounting.manage">
                  <Button type="submit" disabled={updateSettings.isPending} className="justify-self-start">
                    {t('common.save')}
                  </Button>
                </Can>
              </form>
            </Form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
