import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createSupplierPaymentSchema, paymentMethodSchema } from '@erp-platform/contracts';
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

import { TreasurySelect } from '../../../../components/document/treasury-select';
import { useCustomFieldDefinitions } from '../../../settings/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { useCreateSupplierPayment, useSupplierOutstandingInvoices } from '../../api/supplier-payments/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import {
  prepareSupplierAllocations,
  SupplierPaymentAllocationEditor,
  type SupplierAllocationDraft,
} from './supplier-payment-allocation-editor';
import { CurrencySelect } from '../../../../components/document/currency-select';
import {
  ChequeFields,
  EMPTY_CHEQUE_DRAFT,
  prepareCheque,
  type ChequeDraft,
  type ChequeDraftErrors,
} from '../../../../components/document/cheque-fields';
import { DocumentPicker, type PickableDocument } from '../../../../components/document/document-picker';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { useReceivedCheques } from '../../../sales/api/cheques/queries';
import { minorUnitsToDecimalString } from '../../../../lib/money';

const SUPPLIER_PAYMENT_ENTITY_TYPE = 'supplier_payment';
const PAYMENT_METHODS = paymentMethodSchema.options;
/** A cheque payment is either our own cheque (drawn on a bank treasury) or a customer cheque in hand endorsed over (تظهير). */
type ChequeMode = 'own' | 'endorse';
const CHEQUE_MODES: readonly ChequeMode[] = ['own', 'endorse'];

type HeaderFormValues = {
  supplierId: string;
  amount: string;
  currency: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  paymentDate?: string;
  referenceNumber?: string;
  notes?: string;
  customFields?: Record<string, unknown>;
};

/** Mirror of Sales' CreatePaymentReceivedForm: header + optional "allocate now" rows. Currency defaults to the supplier's. */
export function CreateSupplierPaymentForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const createPayment = useCreateSupplierPayment();
  const { data: suppliers } = useSuppliers();
  const { data: definitions, isLoading: definitionsLoading } = useCustomFieldDefinitions(SUPPLIER_PAYMENT_ENTITY_TYPE);
  const [allocationDrafts, setAllocationDrafts] = useState<SupplierAllocationDraft[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [chequeMode, setChequeMode] = useState<ChequeMode>('own');
  const [cheque, setCheque] = useState<ChequeDraft>(EMPTY_CHEQUE_DRAFT);
  const [chequeErrors, setChequeErrors] = useState<ChequeDraftErrors>({});
  const [endorsedChequeId, setEndorsedChequeId] = useState<string | null>(null);

  const formSchema = useMemo(() => {
    const staticSchema = createSupplierPaymentSchema
      .pick({ paymentDate: true, referenceNumber: true, notes: true, paymentMethod: true })
      .extend({ supplierId: z.string().uuid(), amount: z.string().min(1), currency: z.string().length(3) });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      supplierId: suppliers?.[0]?.id ?? '',
      amount: '',
      currency: suppliers?.[0]?.defaultCurrency ?? 'EGP',
      paymentMethod: 'bank_transfer',
      paymentDate: '',
      referenceNumber: '',
      notes: '',
      customFields: {},
    },
  });

  const supplierId = form.watch('supplierId');
  const currency = form.watch('currency');
  const paymentMethod = form.watch('paymentMethod');
  const { data: outstanding, isLoading: outstandingLoading } = useSupplierOutstandingInvoices(supplierId);
  const isCheque = paymentMethod === 'check';
  const endorsing = isCheque && chequeMode === 'endorse';
  const { data: chequesInHand, isLoading: chequesLoading } = useReceivedCheques({ status: 'in_hand' }, endorsing);
  const chequeDocuments = useMemo<PickableDocument[]>(
    () =>
      (chequesInHand ?? []).map((row) => ({
        id: row.id,
        number: row.chequeNumber ?? row.paymentNumber,
        date: row.dueDate,
        party: row.bank ? `${row.customerName} — ${row.bank}` : row.customerName,
        amountMinorUnits: row.amount.amountMinorUnits,
        currency: row.amount.currency,
      })),
    [chequesInHand],
  );

  /** Endorsing: the amount and currency are the cheque's own (locked). */
  function pickEndorsedCheque(id: string) {
    const picked = chequesInHand?.find((row) => row.id === id);
    if (!picked) return;
    setEndorsedChequeId(id);
    form.setValue('amount', minorUnitsToDecimalString(picked.amount.amountMinorUnits));
    if (picked.amount.currency !== form.getValues('currency')) {
      form.setValue('currency', picked.amount.currency);
      setAllocationDrafts([]);
    }
  }

  async function onSubmit(values: HeaderFormValues) {
    setFormError(null);
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(values.amount);
    } catch {
      setFormError(t('purchases.supplierPayments.amountError'));
      return;
    }
    if (BigInt(amountMinorUnits) <= 0n) {
      setFormError(t('purchases.supplierPayments.amountError'));
      return;
    }
    let chequePayload: { number: string; bank: string | null; dueDate: string } | null = null;
    if (values.paymentMethod === 'check' && chequeMode === 'endorse') {
      if (!endorsedChequeId) {
        setFormError(t('cheques.pickChequeRequired'));
        return;
      }
    } else if (values.paymentMethod === 'check') {
      const prepared = prepareCheque(cheque);
      if ('errors' in prepared) {
        setChequeErrors(prepared.errors);
        return;
      }
      chequePayload = prepared.cheque;
    }
    setChequeErrors({});
    const endorse = values.paymentMethod === 'check' && chequeMode === 'endorse';
    const allocations = prepareSupplierAllocations(allocationDrafts, values.currency);
    if (allocations === null) {
      setFormError(t('purchases.supplierPayments.allocationsError'));
      return;
    }
    try {
      await createPayment.mutateAsync({
        supplierId: values.supplierId,
        amount: { amountMinorUnits, currency: values.currency },
        paymentMethod: values.paymentMethod,
        paymentDate: values.paymentDate || undefined,
        referenceNumber: values.referenceNumber || undefined,
        treasuryId: endorse ? null : treasuryId,
        cheque: chequePayload,
        endorsedChequeId: endorse ? endorsedChequeId : null,
        notes: values.notes || undefined,
        customFields: values.customFields,
        allocations: allocations.length > 0 ? allocations : undefined,
      });
      toast.success(t('purchases.supplierPayments.createSuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.supplierPayments.createError'));
    }
  }

  if (definitionsLoading) return <Skeleton className="h-40 w-full" />;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="grid gap-4">
        <FormField
          control={form.control}
          name="supplierId"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('purchases.supplierPayments.supplier')}</FormLabel>
              <Select
                onValueChange={(value) => {
                  field.onChange(value);
                  const supplier = suppliers?.find((s) => s.id === value);
                  if (supplier && !endorsing) form.setValue('currency', supplier.defaultCurrency);
                  setAllocationDrafts([]);
                }}
                value={field.value}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder={t('purchases.supplierPayments.selectSupplier')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {(suppliers ?? []).map((supplier) => (
                    <SelectItem key={supplier.id} value={supplier.id}>
                      {supplier.name}
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
                <FormLabel>{t('purchases.supplierPayments.amount')}</FormLabel>
                <FormControl>
                  <Input inputMode="decimal" placeholder="0.00" readOnly={endorsing} {...field} />
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
                <FormLabel>{t('purchases.supplierPayments.currency')}</FormLabel>
                <FormControl>
                  <CurrencySelect value={field.value} onChange={field.onChange} disabled={endorsing} />
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
              <FormLabel>{t('purchases.supplierPayments.paymentMethod')}</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {PAYMENT_METHODS.map((method) => (
                    <SelectItem key={method} value={method}>
                      {t(`purchases.supplierPayments.paymentMethodValue.${method}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />
        {isCheque ? (
          <StatusTabs
            tabs={CHEQUE_MODES}
            value={chequeMode}
            onChange={(mode) => {
              setChequeMode(mode);
              setEndorsedChequeId(null);
              setChequeErrors({});
            }}
            label={(mode) => t(`cheques.mode.${mode}`)}
          />
        ) : null}
        {endorsing ? (
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('cheques.pickCheque')}</span>
            <DocumentPicker
              documents={chequeDocuments}
              value={endorsedChequeId}
              onChange={(id) => pickEndorsedCheque(id)}
              placeholder={chequesLoading ? t('common.loading') : t('cheques.pickCheque')}
              disabled={chequesLoading}
            />
            <p className="text-xs text-muted-foreground">
              {!chequesLoading && chequeDocuments.length === 0 ? t('cheques.noChequesInHand') : t('cheques.endorseHint')}
            </p>
          </div>
        ) : (
          <TreasurySelect value={treasuryId} onChange={setTreasuryId} currency={currency} paymentMethod={paymentMethod} />
        )}
        {isCheque && !endorsing ? (
          <div className="grid gap-4 sm:grid-cols-3">
            <ChequeFields value={cheque} onChange={setCheque} errors={chequeErrors} />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="referenceNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('purchases.supplierPayments.referenceNumber')}</FormLabel>
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
                <FormLabel>{t('purchases.supplierPayments.paymentDate')}</FormLabel>
                <FormControl>
                  <Input type="date" {...field} value={field.value ?? ''} />
                </FormControl>
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
              <FormLabel>{t('purchases.supplierPayments.notes')}</FormLabel>
              <FormControl>
                <Textarea {...field} value={field.value ?? ''} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <Separator />
        <p className="text-sm font-medium text-muted-foreground">{t('purchases.supplierPayments.allocateNow')}</p>
        {outstandingLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <SupplierPaymentAllocationEditor
            invoices={outstanding ?? []}
            currency={currency}
            drafts={allocationDrafts}
            onChange={setAllocationDrafts}
          />
        )}
        {formError ? <p className="text-sm text-destructive">{formError}</p> : null}

        {definitions && definitions.length > 0 ? (
          <>
            <Separator />
            <p className="text-sm font-medium text-muted-foreground">{t('purchases.supplierPayments.customFields')}</p>
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
