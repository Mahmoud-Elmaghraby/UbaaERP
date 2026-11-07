import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { createPaymentReceivedSchema, paymentMethodSchema } from '@erp-platform/contracts';
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
} from '@erp-platform/ui';
import { CheckCircle2 } from 'lucide-react';

import { useBaseCurrency, useCustomFieldDefinitions } from '../../../settings/queries';
import { useCustomers } from '../../api/customers/queries';
import { useCreatePaymentReceived } from '../../api/payments-received/queries';
import { useSalesInvoiceRegister } from '../../api/sales-invoices/queries';
import { CustomerPicker } from '../../lib/customer-picker';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import { todayIso } from '../../../../lib/format-date';
import { Amount } from '../../../../components/amount';
import { CurrencySelect } from '../../../../components/document/currency-select';
import { TreasurySelect } from '../../../../components/document/treasury-select';
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
import { toOpenInvoiceRows } from './open-invoices-allocation';
import { PAYMENTS_RECEIVED_PATH } from './payment-received-status';
import { usePaymentReceivedActions } from './use-payment-received-actions';

const PAYMENT_RECEIVED_ENTITY_TYPE = 'payment_received';
const PAYMENT_METHODS = paymentMethodSchema.options;

type HeaderFormValues = {
  customerId: string;
  amount: string;
  currency: string;
  paymentMethod: (typeof PAYMENT_METHODS)[number];
  paymentDate?: string | null;
  referenceNumber?: string | null;
  notes?: string | null;
  customFields?: Record<string, unknown>;
};

function toMinor(text: string): bigint | null {
  try {
    const minor = BigInt(decimalToMinorUnits(text));
    return minor > 0n ? minor : null;
  } catch {
    return null;
  }
}

/** /sales/payments-received/new (?customerId=&invoiceId= preselect) — a receipt and its allocation to open invoices. */
export function PaymentReceivedEditorPage() {
  const { isLoading } = useCustomFieldDefinitions(PAYMENT_RECEIVED_ENTITY_TYPE);
  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  return <PaymentReceivedEditor />;
}

function PaymentReceivedEditor() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const requestedCustomerId = params.get('customerId') ?? '';
  const requestedInvoiceId = params.get('invoiceId');
  const baseCurrency = useBaseCurrency();
  const { data: customers } = useCustomers();
  const { data: definitions } = useCustomFieldDefinitions(PAYMENT_RECEIVED_ENTITY_TYPE);
  const createPayment = useCreatePaymentReceived();
  const actions = usePaymentReceivedActions();
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [cheque, setCheque] = useState<ChequeDraft>(EMPTY_CHEQUE_DRAFT);
  const [chequeErrors, setChequeErrors] = useState<ChequeDraftErrors>({});
  const [drafts, setDrafts] = useState<AllocationDrafts>({});
  const [error, setError] = useState<string | null>(null);
  const submitIntent = useRef<'draft' | 'post'>('draft');
  const preselected = useRef(false);

  const formSchema = useMemo(() => {
    const staticSchema = createPaymentReceivedSchema
      .pick({ paymentDate: true, referenceNumber: true, notes: true, paymentMethod: true })
      .extend({
        customerId: z.string().uuid({ message: t('sales.paymentsReceived.customerRequired') }),
        amount: z.string().min(1, { message: t('sales.paymentsReceived.amountError') }),
        currency: z.string().length(3),
      });
    if (!definitions) return staticSchema;
    return staticSchema.extend({ customFields: buildCustomFieldsSchema(definitions) });
  }, [definitions, t]);

  const form = useForm<HeaderFormValues>({
    resolver: zodResolver(formSchema as z.ZodType<HeaderFormValues>),
    defaultValues: {
      customerId: requestedCustomerId,
      amount: '',
      currency: baseCurrency,
      paymentMethod: 'cash',
      paymentDate: todayIso(),
      referenceNumber: '',
      notes: '',
      customFields: {},
    },
  });

  const customerId = form.watch('customerId');
  const currency = form.watch('currency');
  const paymentMethod = form.watch('paymentMethod');
  const amountText = form.watch('amount');
  const amountMinor = toMinor(amountText ?? '');

  // The customer's currency once known (also for a preselected customer).
  const customer = (customers ?? []).find((c) => c.id === customerId);
  useEffect(() => {
    if (customer?.defaultCurrency && !form.getFieldState('currency').isDirty) {
      form.setValue('currency', customer.defaultCurrency);
    }
  }, [customer?.id, customer?.defaultCurrency, form]);

  const { data: openInvoices, isLoading: invoicesLoading } = useSalesInvoiceRegister(
    { customerId, openOnly: true },
    Boolean(customerId),
  );
  const invoices = useMemo(
    () => toOpenInvoiceRows((openInvoices ?? []).filter((invoice) => invoice.currency === currency)),
    [openInvoices, currency],
  );

  // ?invoiceId= — collect that invoice's outstanding in full.
  useEffect(() => {
    if (preselected.current || !requestedInvoiceId || !openInvoices) return;
    preselected.current = true;
    const invoice = openInvoices.find((row) => row.id === requestedInvoiceId);
    if (!invoice) return;
    const text = minorUnitsToDecimalString(invoice.outstandingMinorUnits);
    if (invoice.currency) form.setValue('currency', invoice.currency);
    if (!form.getValues('amount')) form.setValue('amount', text);
    setDrafts({ [invoice.id]: text });
  }, [openInvoices, requestedInvoiceId, form]);

  const allocated = allocationsTotal(drafts);

  async function onSubmit(values: HeaderFormValues) {
    setError(null);
    const amount = toMinor(values.amount);
    if (amount === null) {
      form.setError('amount', { message: t('sales.paymentsReceived.amountError') });
      return;
    }
    // A cheque receipt: number + due date required; it reaches a bank only when collected (no treasury now).
    let chequePayload: { number: string; bank: string | null; dueDate: string } | null = null;
    if (values.paymentMethod === 'check') {
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
      setError(t('sales.paymentsReceived.allocationsOverError'));
      return;
    }
    const post = submitIntent.current === 'post';
    if (post && !(await confirmDialog(t('sales.paymentsReceived.postConfirm')))) return;
    try {
      const created = await createPayment.mutateAsync({
        customerId: values.customerId,
        amount: { amountMinorUnits: amount.toString(), currency: values.currency },
        paymentMethod: values.paymentMethod,
        paymentDate: values.paymentDate || undefined,
        referenceNumber: values.referenceNumber?.trim() || undefined,
        treasuryId: chequePayload ? null : treasuryId,
        cheque: chequePayload,
        notes: values.notes?.trim() || undefined,
        customFields: values.customFields,
        allocations:
          allocations.length > 0
            ? allocations.map((a) => ({ salesInvoiceId: a.invoiceId, allocatedAmount: a.allocatedAmount }))
            : undefined,
      });
      toast.success(t('sales.paymentsReceived.createSuccess'));
      if (post) await actions.post(created.id, { confirm: false });
      navigate(`${PAYMENTS_RECEIVED_PATH}/${created.id}`, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('sales.paymentsReceived.createError'));
    }
  }

  // Ctrl/⌘+S saves as a draft.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault();
        submitIntent.current = 'draft';
        void form.handleSubmit(onSubmit)();
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const busy = createPayment.isPending || actions.isPending;
  const remainder = amountMinor === null ? null : amountMinor - allocated;

  return (
    <Form {...form}>
      <form id="payment-received-form" onSubmit={form.handleSubmit(onSubmit)}>
        <DocumentHeaderBar
          backTo={PAYMENTS_RECEIVED_PATH}
          backLabel={t('documents.back')}
          eyebrow={t('sales.tabs.paymentsReceived')}
          title={t('sales.paymentsReceived.newPayment')}
          status={<Badge variant="neutral">{t('sales.paymentsReceived.status.draft')}</Badge>}
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
                    name="customerId"
                    render={({ field }) => (
                      <FormItem className="sm:col-span-2">
                        <FormLabel>{t('sales.paymentsReceived.customer')}</FormLabel>
                        <CustomerPicker
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
                    name="amount"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.paymentsReceived.amount')}</FormLabel>
                        <FormControl>
                          <Input inputMode="decimal" dir="ltr" className="text-end tabular-nums" placeholder="0.00" {...field} />
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
                          <CurrencySelect
                            value={field.value}
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
                  {paymentMethod === 'check' ? (
                    <ChequeFields value={cheque} onChange={setCheque} errors={chequeErrors} />
                  ) : (
                    <TreasurySelect value={treasuryId} onChange={setTreasuryId} currency={currency} paymentMethod={paymentMethod} />
                  )}
                  <FormField
                    control={form.control}
                    name="referenceNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('sales.paymentsReceived.referenceNumber')}</FormLabel>
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
                title={t('sales.paymentsReceived.allocateToInvoices')}
                description={t('sales.paymentsReceived.allocateHint')}
                flush
              >
                {customerId ? (
                  <OpenInvoicesAllocation
                    invoices={invoices}
                    isLoading={invoicesLoading}
                    currency={currency}
                    drafts={drafts}
                    onChange={setDrafts}
                    available={amountMinor}
                    emptyText={t('sales.paymentsReceived.noOpenInvoices')}
                  />
                ) : (
                  <p className="px-5 pb-5 text-sm text-muted-foreground">{t('sales.paymentsReceived.pickCustomerFirst')}</p>
                )}
                {error ? <p className="px-5 pb-4 text-sm text-destructive">{error}</p> : null}
              </SectionCard>

              <SectionCard>
                <FormField
                  control={form.control}
                  name="notes"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>{t('sales.paymentsReceived.notes')}</FormLabel>
                      <FormControl>
                        <Textarea rows={3} {...field} value={field.value ?? ''} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </SectionCard>

              {definitions && definitions.length > 0 ? (
                <SectionCard title={t('sales.paymentsReceived.customFields')}>
                  <CustomFieldsFormSection definitions={definitions} />
                </SectionCard>
              ) : null}
            </>
          }
          side={
            <TotalsPanel
              title={t('documents.summary')}
              rows={[
                ...(customer ? [{ label: t('sales.paymentsReceived.customer'), value: customer.name }] : []),
                {
                  label: t('sales.paymentsReceived.amount'),
                  value: <Amount value={amountMinor === null ? null : amountMinor.toString()} hideCurrency />,
                },
                {
                  label: t('sales.paymentsReceived.allocatedTotal'),
                  value: <Amount value={allocated.toString()} hideCurrency zeroAsDash />,
                },
              ]}
              totalLabel={t('sales.paymentsReceived.unallocatedAmount')}
              totalValue={<Amount value={remainder === null ? null : remainder.toString()} hideCurrency />}
              currency={currency}
            />
          }
        />
      </form>
    </Form>
  );
}
