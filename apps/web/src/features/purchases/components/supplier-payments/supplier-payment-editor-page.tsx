import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createSupplierPaymentSchema, paymentMethodSchema } from '@erp-platform/contracts';
import {
  Badge,
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
  Skeleton,
  Textarea,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { CheckCircle2 } from 'lucide-react';

import { useBaseCurrency, useCustomFieldDefinitions } from '../../../settings/queries';
import { useSuppliers } from '../../api/suppliers/queries';
import { useCreateSupplierPayment, useSupplierOutstandingInvoices } from '../../api/supplier-payments/queries';
import { useReceivedCheques } from '../../../sales/api/cheques/queries';
import { SupplierPicker } from '../../lib/supplier-picker';
import { toSupplierOpenRows } from '../../lib/supplier-open-invoices';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { todayIso } from '../../../../lib/format-date';
import { useSaveShortcut } from '../../../../lib/use-save-shortcut';
import { Amount } from '../../../../components/amount';
import { StatusTabs } from '../../../../components/list/status-tabs';
import { CurrencySelect } from '../../../../components/document/currency-select';
import { TreasurySelect } from '../../../../components/document/treasury-select';
import { DocumentPicker, type PickableDocument } from '../../../../components/document/document-picker';
import { DocumentBody, DocumentHeaderBar, SectionCard, TotalsPanel } from '../../../../components/document/document-layout';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import {
  ChequeFields,
  EMPTY_CHEQUE_DRAFT,
  prepareCheque,
  type ChequeDraft,
  type ChequeDraftErrors,
} from '../../../../components/document/cheque-fields';
import {
  allocationsTotal,
  OpenInvoicesAllocation,
  prepareAllocations,
  type AllocationDrafts,
} from '../../../../components/document/open-invoices-allocation';
import { SUPPLIER_PAYMENTS_PATH } from './supplier-payment-status';
import { useSupplierPaymentActions } from './use-supplier-payment-actions';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';

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
  paymentDate?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

/** A positive amount in minor units, or null. */
function toMinor(text: string): bigint | null {
  try {
    const minor = BigInt(decimalToMinorUnits(text));
    return minor > 0n ? minor : null;
  } catch {
    return null;
  }
}

/** /purchases/supplier-payments/new (?supplierId=&invoiceId= preselect) — a payment and its allocation to open invoices. */
export function SupplierPaymentEditorPage() {
  const { isLoading } = useCustomFieldDefinitions(SUPPLIER_PAYMENT_ENTITY_TYPE);
  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <SupplierPaymentEditor />;
}

function SupplierPaymentEditor() {
  const { t } = useTranslation();
  const chequesEnabled = useHasFeature(FEATURE_KEYS.CHEQUES);
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedInvoiceId = params.get('invoiceId');
  const baseCurrency = useBaseCurrency();
  const { data: suppliers } = useSuppliers();
  const { data: definitions } = useCustomFieldDefinitions(SUPPLIER_PAYMENT_ENTITY_TYPE);
  const createPayment = useCreateSupplierPayment();
  const actions = useSupplierPaymentActions();
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [chequeMode, setChequeMode] = useState<ChequeMode>('own');
  const [cheque, setCheque] = useState<ChequeDraft>(EMPTY_CHEQUE_DRAFT);
  const [chequeErrors, setChequeErrors] = useState<ChequeDraftErrors>({});
  const [endorsedChequeId, setEndorsedChequeId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<AllocationDrafts>({});
  const [error, setError] = useState<string | null>(null);
  const submitIntent = useRef<'draft' | 'post'>('draft');
  const preselected = useRef(false);

  const formSchema = useMemo(() => {
    const staticSchema = createSupplierPaymentSchema
      .pick({ paymentDate: true, referenceNumber: true, notes: true, paymentMethod: true })
      .extend({
        supplierId: z.string().uuid({ message: t('purchases.supplierPayments.supplierRequired') }),
        amount: z.string().min(1, { message: t('purchases.supplierPayments.amountError') }),
        currency: z.string().length(3),
      });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions, t]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      supplierId: params.get('supplierId') ?? '',
      amount: '',
      currency: baseCurrency,
      paymentMethod: 'cash',
      paymentDate: todayIso(),
      referenceNumber: '',
      notes: '',
      customFields: {},
    },
  });

  const supplierId = form.watch('supplierId');
  const currency = form.watch('currency');
  const paymentMethod = form.watch('paymentMethod');
  const amountMinor = toMinor(form.watch('amount') ?? '');
  const supplier = suppliers?.find((s) => s.id === supplierId);
  const isCheque = paymentMethod === 'check';
  const endorsing = isCheque && chequeMode === 'endorse';

  // A supplier's own currency is the natural default (not while endorsing a cheque — its currency wins).
  useEffect(() => {
    if (supplier && !endorsing) form.setValue('currency', supplier.defaultCurrency);
  }, [supplier?.id]);

  const { data: outstanding, isLoading: outstandingLoading } = useSupplierOutstandingInvoices(supplierId || null);
  const invoices = useMemo(() => toSupplierOpenRows(outstanding ?? [], currency), [outstanding, currency]);

  // ?invoiceId= — pay that invoice's outstanding in full.
  useEffect(() => {
    if (preselected.current || !requestedInvoiceId || !outstanding) return;
    preselected.current = true;
    const invoice = outstanding.find((row) => row.purchaseInvoiceId === requestedInvoiceId);
    if (!invoice) return;
    const text = minorUnitsToDecimalString(invoice.outstandingAmount.amountMinorUnits);
    form.setValue('currency', invoice.outstandingAmount.currency);
    if (!form.getValues('amount')) form.setValue('amount', text);
    setDrafts({ [invoice.purchaseInvoiceId]: text });
  }, [outstanding, requestedInvoiceId, form]);

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
      setDrafts({});
    }
  }

  const allocated = allocationsTotal(drafts);

  async function onSubmit(values: HeaderFormValues) {
    setError(null);
    const amount = toMinor(values.amount);
    if (amount === null) {
      form.setError('amount', { message: t('purchases.supplierPayments.amountError') });
      return;
    }
    let chequePayload: { number: string; bank: string | null; dueDate: string } | null = null;
    if (endorsing) {
      if (!endorsedChequeId) {
        setError(t('cheques.pickChequeRequired'));
        return;
      }
    } else if (isCheque) {
      const prepared = prepareCheque(cheque);
      if ('errors' in prepared) {
        setChequeErrors(prepared.errors);
        return;
      }
      chequePayload = prepared.cheque;
    }
    setChequeErrors({});
    const allocations = prepareAllocations(drafts, invoices, values.currency, amount);
    if (allocations === null) {
      setError(t('purchases.supplierPayments.allocationsOverError'));
      return;
    }
    const post = submitIntent.current === 'post';
    if (post && !(await confirmDialog(t('purchases.supplierPayments.postConfirm')))) return;
    try {
      const created = await createPayment.mutateAsync({
        supplierId: values.supplierId,
        amount: { amountMinorUnits: amount.toString(), currency: values.currency },
        paymentMethod: values.paymentMethod,
        paymentDate: values.paymentDate || undefined,
        referenceNumber: values.referenceNumber?.trim() || undefined,
        treasuryId: endorsing ? null : treasuryId,
        cheque: chequePayload,
        endorsedChequeId: endorsing ? endorsedChequeId : null,
        notes: values.notes?.trim() || undefined,
        customFields: values.customFields,
        allocations:
          allocations.length > 0
            ? allocations.map((a) => ({ purchaseInvoiceId: a.invoiceId, allocatedAmount: a.allocatedAmount }))
            : undefined,
      });
      toast.success(t('purchases.supplierPayments.createSuccess'));
      if (post) await actions.post(created.id, { confirm: false });
      navigate(`${SUPPLIER_PAYMENTS_PATH}/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('purchases.supplierPayments.createError'));
    }
  }

  const busy = createPayment.isPending || actions.isPending;
  useSaveShortcut(() => {
    submitIntent.current = 'draft';
    void form.handleSubmit(onSubmit)();
  }, busy);
  const remainder = amountMinor === null ? null : amountMinor - allocated;

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={SUPPLIER_PAYMENTS_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('purchases.tabs.supplierPayments')}
          title={t('purchases.supplierPayments.newPayment')}
          status={<Badge variant="neutral">{t('purchases.supplierPayments.status.draft')}</Badge>}
          actions={
            <>
              <Button type="button" variant="ghost" onClick={() => navigate(-1)}>
                {t('common.cancel')}
              </Button>
              <Button
                type="submit"
                variant="outline"
                disabled={busy}
                title="Ctrl+S"
                onClick={() => {
                  submitIntent.current = 'draft';
                }}
              >
                {t('documents.saveDraft')}
              </Button>
              <Button
                type="submit"
                disabled={busy}
                onClick={() => {
                  submitIntent.current = 'post';
                }}
              >
                <CheckCircle2 />
                {t('documents.saveAndPost')}
              </Button>
            </>
          }
        />
        <DocumentBody
          main={
            <>
              <SectionCard title={t('documents.info')}>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <FormField
                    control={form.control}
                    name="supplierId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{t('purchases.supplierPayments.supplier')}</FormLabel>
                        <SupplierPicker
                          value={field.value}
                          onChange={(id) => {
                            field.onChange(id);
                            setDrafts({});
                          }}
                        />
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
                  <FormField
                    control={form.control}
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.supplierPayments.amount')}</FormLabel>
                        <FormControl>
                          <Input
                            inputMode="decimal"
                            dir="ltr"
                            className="text-end tabular-nums"
                            placeholder="0.00"
                            readOnly={endorsing}
                            {...field}
                          />
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
                          <CurrencySelect
                            value={field.value}
                            disabled={endorsing}
                            onChange={(code) => {
                              field.onChange(code);
                              setDrafts({});
                            }}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
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
                            {PAYMENT_METHODS.filter((method) => method !== 'check' || chequesEnabled).map((method) => (
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
                    <div className="grid content-end sm:col-span-2 lg:col-span-3">
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
                    </div>
                  ) : null}
                  {endorsing ? (
                    <div className="grid gap-2 sm:col-span-2">
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
                  {isCheque && !endorsing ? <ChequeFields value={cheque} onChange={setCheque} errors={chequeErrors} /> : null}
                  <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('purchases.supplierPayments.referenceNumber')}</FormLabel>
                        <FormControl>
                          <Input dir="ltr" {...field} value={field.value ?? ''} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </SectionCard>

              <SectionCard
                title={t('purchases.supplierPayments.allocateToInvoices')}
                description={t('purchases.supplierPayments.allocateHint')}
                flush
              >
                {supplierId ? (
                  <OpenInvoicesAllocation
                    invoices={invoices}
                    isLoading={outstandingLoading}
                    currency={currency}
                    drafts={drafts}
                    onChange={setDrafts}
                    available={amountMinor}
                    emptyText={t('purchases.supplierPayments.noOutstandingInvoices')}
                  />
                ) : (
                  <p className="px-5 pb-5 text-sm text-muted-foreground">{t('purchases.supplierPayments.pickSupplierFirst')}</p>
                )}
                {error ? <p className="px-5 pb-4 text-sm text-destructive">{error}</p> : null}
              </SectionCard>

              <SectionCard>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('documents.notes')}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                {definitions && definitions.length > 0 ? (
                  <div className="mt-4">
                    <CustomFieldsFormSection definitions={definitions} namePrefix="customFields" />
                  </div>
                ) : null}
              </SectionCard>
            </>
          }
          side={
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                ...(supplier ? [{ label: t('purchases.supplierPayments.supplier'), value: supplier.name }] : []),
                {
                  label: t('purchases.supplierPayments.amount'),
                  value: <Amount value={amountMinor === null ? null : amountMinor.toString()} hideCurrency />,
                },
                {
                  label: t('documents.allocation.allocatedTotal'),
                  value: <Amount value={allocated.toString()} hideCurrency zeroAsDash />,
                },
              ]}
              totalLabel={t('purchases.supplierPayments.unallocatedAmount')}
              totalValue={<Amount value={remainder === null ? null : remainder.toString()} hideCurrency />}
              currency={currency}
            />
          }
        />
      </form>
    </Form>
  );
}
