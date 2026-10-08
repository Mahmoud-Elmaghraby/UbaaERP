import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useWarehouses } from '../../../inventory/api/warehouses/queries';
import { useOpenPosSession } from '../../api/pos/queries';
import { useTenantSettings } from '../../../settings/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import { TreasurySelect } from '../../../../components/document/treasury-select';

/**
 * Shown by PosPage whenever the current cashier has no open session — POS Stage 4
 * (claude/sales-pos-research.md). warehouseId is required at open time (migration
 * 0064): it's what checkout()'s Delivery is fulfilled from, so it must be fixed for
 * the whole session rather than picked per sale. openingCashAmount's currency
 * becomes the session's own currency, and — since there is no tenant-wide "operating
 * currency" concept yet — is also what every cart line and tender in this session is
 * priced/collected in (same "first decision fixes the currency for everything
 * downstream" pattern as Quotations/Purchase Orders' manual create path).
 * The session's currency is always the tenant's own configured currency
 * (tenant_settings.currencyCode, Settings → General) — there is no
 * multi-currency ledger anywhere in the platform, so this field is derived
 * and read-only rather than cashier-editable free text.
 */
type OpenSessionFormValues = {
  warehouseId: string;
  openingCashAmount: string;
  currency: string;
  notes?: string;
};

export function OpenSessionForm() {
  const { t } = useTranslation();
  const { data: warehouses, isLoading: warehousesLoading } = useWarehouses();
  const { data: tenantSettings, isLoading: tenantSettingsLoading } = useTenantSettings();
  const openSession = useOpenPosSession();

  const formSchema = z.object({
    warehouseId: z.string().uuid(),
    openingCashAmount: z.string().min(1),
    currency: z.string().length(3),
    notes: z.string().optional(),
  });

  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const form = useForm<OpenSessionFormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      warehouseId: warehouses?.[0]?.id ?? '',
      openingCashAmount: '',
      currency: tenantSettings?.currencyCode ?? '',
      notes: '',
    },
  });

  // react-hook-form only reads `defaultValues` on this component's very first
  // render — if `warehouses` is still loading at that moment (a real possibility
  // here, since nothing else on the POS screen prefetches it first), warehouseId
  // would stay '' forever even after the list arrives. This backfills it exactly
  // once, only while the field is still untouched, so it never fights a value the
  // cashier has since picked themselves.
  useEffect(() => {
    if (!form.getValues('warehouseId') && warehouses && warehouses.length > 0) {
      form.setValue('warehouseId', warehouses[0].id);
    }
  }, [warehouses]);

  async function onSubmit(values: OpenSessionFormValues) {
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(values.openingCashAmount);
    } catch {
      form.setError('openingCashAmount', { message: t('pos.openSession.amountError') });
      return;
    }
    try {
      await openSession.mutateAsync({
        warehouseId: values.warehouseId,
        treasuryId,
        openingCashAmount: { amountMinorUnits, currency: values.currency },
        notes: values.notes || undefined,
      });
      toast.success(t('pos.openSession.success'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('pos.openSession.error'));
    }
  }

  if (warehousesLoading || tenantSettingsLoading) {
    return <Skeleton className="h-64 w-full" />;
  }

  return (
    <Card className="mx-auto max-w-md">
      <CardHeader>
        <CardTitle>{t('pos.openSession.title')}</CardTitle>
        <CardDescription>{t('pos.openSession.subtitle')}</CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
            <FormField
              control={form.control}
              name="warehouseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pos.openSession.warehouse')}</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {(warehouses ?? []).map((warehouse) => (
                        <SelectItem key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <TreasurySelect
              value={treasuryId}
              onChange={setTreasuryId}
              currency={form.watch('currency')}
              paymentMethod="cash"
              label={t('pos.openSession.treasury')}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="openingCashAmount"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pos.openSession.openingCashAmount')}</FormLabel>
                    <FormControl>
                      <Input inputMode="decimal" placeholder="0.00" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="currency"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('pos.openSession.currency')}</FormLabel>
                    <FormControl>
                      <Input {...field} disabled readOnly className="uppercase" />
                    </FormControl>
                    <FormDescription>{t('pos.openSession.currencyHint')}</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="notes"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('pos.openSession.notes')}</FormLabel>
                  <FormControl>
                    <Textarea {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <Button type="submit" disabled={openSession.isPending} className="mt-2">
              {t('pos.openSession.submit')}
            </Button>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
}
