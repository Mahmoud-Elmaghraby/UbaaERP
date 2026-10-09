import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { TreasurySelect } from '../../../../components/document/treasury-select';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import {
  createPaymentReceivedSchema,
  paymentMethodSchema,
  type CreatePaymentAllocationDto,
} from '@erp-platform/contracts';
import {
  buildCustomFieldsSchema,
  Button,
  CustomFieldsFormSection,
  Form,
  FormControl,
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
  Separator,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useCustomers } from '../../api/customers/queries';
import { useCreatePaymentReceived } from '../../api/payments-received/queries';
import { useCustomerInvoices } from '../../hooks/payments-received/use-customer-invoices';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import {
  PaymentAllocationEditor,
  type PaymentAllocationDraft,
} from './payment-allocation-editor';
import { CurrencySelect } from '../../../../components/document/currency-select';

const PAYMENT_RECEIVED_ENTITY_TYPE = 'payment_received';

const PAYMENT_METHODS = paymentMethodSchema.options;

function prepareAllocations(
  drafts: PaymentAllocationDraft[],
  currency: string,
): CreatePaymentAllocationDto[] | null {
  const touched = drafts.filter((d) => d.salesInvoiceId && d.allocatedAmount.trim() !== '');
  if (touched.length === 0) return [];
  const prepared: CreatePaymentAllocationDto[] = [];
  for (const draft of touched) {
    if (!draft.salesInvoiceId) return null;
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(draft.allocatedAmount);
    } catch {
      return null;
    }
    if (BigInt(amountMinorUnits) <= 0n) return null;
    prepared.push({ salesInvoiceId: draft.salesInvoiceId, allocatedAmount: { amountMinorUnits, currency } });
  }
  return prepared;
}

type HeaderFormValues = {
  customerId: string;
  amount: string;
  currency: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

/**
 * Unlike every other Sales document, a payment received isn't built against a fixed
 * worksheet of outstanding lines — allocations are optional at creation time and can
 * also be added later via the dedicated "allocate" action (see
 * payment-received-allocate-form.tsx), matching the backend's own create()/allocate()
 * split (PaymentsReceivedService). The amount's currency defaults to the selected
 * customer's defaultCurrency but is editable — a payment isn't required to match it,
 * only the allocations on it must share the payment's own currency
 * (assertSameCurrency, re-checked server-side).
 */
export function CreatePaymentReceivedForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createPayment = useCreatePaymentReceived();
  const { data: customers } = useCustomers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(
    PAYMENT_RECEIVED_ENTITY_TYPE,
  );
  const [allocationDrafts, setAllocationDrafts] = useState<PaymentAllocationDraft[]>([]);
  const [allocationsError, setAllocationsError] = useState<string | null>(null);
  const [treasuryId, setTreasuryId] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createPaymentReceivedSchema
      .pick({ paymentDate: true, referenceNumber: true, notes: true, paymentMethod: true })
      .extend({ customerId: z.string().uuid(), amount: z.string().min(1), currency: z.string().length(3) });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      customerId: customers?.[0]?.id ?? '',
      amount: '',
      currency: customers?.[0]?.defaultCurrency ?? 'SAR',
      paymentMethod: 'bank_transfer',
      paymentDate: '',
      referenceNumber: '',
      notes: '',
      customFields: {},
    },
  });

  const selectedCustomerId = form.watch('customerId');
  const { invoiceOptions, isLoading: invoiceOptionsLoading } = useCustomerInvoices(selectedCustomerId);

  async function onSubmit(values: HeaderFormValues) {
    setAllocationsError(null);
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(values.amount);
    } catch {
      setAllocationsError(t('sales.paymentsReceived.amountError'));
      return;
    }
    const preparedAllocations = prepareAllocations(allocationDrafts, values.currency);
    if (preparedAllocations === null) {
      setAllocationsError(t('sales.paymentsReceived.allocationsError'));
      return;
    }
    try {
      await createPayment.mutateAsync({
        customerId: values.customerId,
        amount: { amountMinorUnits, currency: values.currency },
        paymentMethod: values.paymentMethod,
        paymentDate: values.paymentDate || undefined,
        referenceNumber: values.referenceNumber || undefined,
        treasuryId,
        notes: values.notes,
        customFields: values.customFields,
        allocations: preparedAllocations.length > 0 ? preparedAllocations : undefined,
      });
      toast.success(t('sales.paymentsReceived.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.paymentsReceived.createError'));
    }
  }

  if (definitionsLoading) {
    return <Skeleton className="h-40 w-full" />;
  }

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="customerId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.paymentsReceived.customer')}</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  const customer = customers?.find((c) => c.id === value);
                  if (customer) form.setValue('currency', customer.defaultCurrency);
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(customers ?? []).map((customer) => (
                    <SelectItem key={customer.id} value={customer.id}>
                      {customer.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="amount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('sales.paymentsReceived.amount')}</FormLabel>
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
                <FormLabel>{t('sales.paymentsReceived.currency')}</FormLabel>
                <FormControl>
                  <CurrencySelect value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.paymentsReceived.paymentMethod')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(`sales.paymentsReceived.paymentMethodValue.${method}`)}
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
          paymentMethod={form.watch('paymentMethod')}
        />
        <FormField
          control={form.control}
          name="referenceNumber"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.paymentsReceived.referenceNumber')}</FormLabel>
              <FormControl>
                <Input {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="paymentDate"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.paymentsReceived.paymentDate')}</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="notes"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('sales.paymentsReceived.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('sales.paymentsReceived.allocateNow')}</p>
        {invoiceOptionsLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <PaymentAllocationEditor
            invoiceOptions={invoiceOptions}
            drafts={allocationDrafts}
            onChange={setAllocationDrafts}
          />
        )}
        {allocationsError ? <p className="text-sm text-destructive">{allocationsError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('sales.paymentsReceived.customFields')}</p>
            <CustomFieldsFormSection definitions={definitions} />
          </>
        ) : null}

        <Button type="submit" disabled={createPayment.isPending} className="mt-2">
          {t('common.save')}
        </Button>
      </form>
    </Form>
  );
}
