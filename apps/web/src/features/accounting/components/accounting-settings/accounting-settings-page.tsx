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
} from '@erp-platform/ui';

import { useAccountingSettings, useUpdateAccountingSettings } from '../../api/accounting-settings/queries';
import { usePostableAccounts } from '../../hooks/use-postable-accounts';
import { ApiError } from '../../../../lib/api-client';

const NONE = '__none__';

const MAPPING_FIELDS = [
  { name: 'accountsReceivableAccountId', labelKey: 'accounting.settings.accountsReceivable' },
  { name: 'inventoryAccountId', labelKey: 'accounting.settings.inventory' },
  { name: 'cogsAccountId', labelKey: 'accounting.settings.cogs' },
  { name: 'salesReturnsContraAccountId', labelKey: 'accounting.settings.salesReturnsContra' },
  { name: 'revenueAccountId', labelKey: 'accounting.settings.revenue' },
  { name: 'accountsPayableAccountId', labelKey: 'accounting.settings.accountsPayable' },
  { name: 'purchaseExpenseAccountId', labelKey: 'accounting.settings.purchaseExpense' },
] as const;

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
    defaultValues: {
      accountsReceivableAccountId: null,
      inventoryAccountId: null,
      cogsAccountId: null,
      salesReturnsContraAccountId: null,
      revenueAccountId: null,
      accountsPayableAccountId: null,
      purchaseExpenseAccountId: null,
    },
  });

  useEffect(() => {
    if (settings) {
      form.reset({
        accountsReceivableAccountId: settings.accountsReceivableAccountId,
        inventoryAccountId: settings.inventoryAccountId,
        cogsAccountId: settings.cogsAccountId,
        salesReturnsContraAccountId: settings.salesReturnsContraAccountId,
        revenueAccountId: settings.revenueAccountId,
        accountsPayableAccountId: settings.accountsPayableAccountId,
        purchaseExpenseAccountId: settings.purchaseExpenseAccountId,
      });
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
      <h1 className="text-2xl font-semibold">{t('accounting.tabs.settings')}</h1>

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
                {MAPPING_FIELDS.map(({ name, labelKey }) => (
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
