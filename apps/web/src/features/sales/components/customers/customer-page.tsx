import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { CustomerAccountSummaryDto, CustomerDto, SalesInvoiceRegisterRowDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  EmptyState,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  cn,
  toast,
  useHasFeature,
} from '@erp-platform/ui';
import { AlertTriangle, ChevronDown, FileQuestion, FileText, Pencil, Plus } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useCustomFieldDefinitions, useTaxRuleLookup } from '../../../settings/queries';
import { useCustomer, useCustomerAccountSummary, useDeleteCustomer } from '../../api/customers/queries';
import { useSalesInvoiceRegister } from '../../api/sales-invoices/queries';
import { usePriceLists } from '../../api/price-lists/queries';
import { useSalesRepName } from '../sales-reps/sales-rep-select';
import {
  DocumentBody,
  DocumentHeaderBar,
  InfoGrid,
  PanelCard,
  SectionCard,
} from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate } from '../../../../lib/format-date';

const CUSTOMERS_PATH = '/sales/customers';
const RECENT_LIMIT = 10;

const AGING_BUCKETS: Array<{ bucket: CustomerAccountSummaryDto['aging'][number]['bucket']; labelKey: string; color: string }> = [
  { bucket: 'current', labelKey: 'statements.aging.current', color: 'bg-success' },
  { bucket: '1_30', labelKey: 'statements.aging.days1To30', color: 'bg-info' },
  { bucket: '31_60', labelKey: 'statements.aging.days31To60', color: 'bg-warning' },
  { bucket: '61_90', labelKey: 'statements.aging.days61To90', color: 'bg-orange-500' },
  { bucket: '90_plus', labelKey: 'statements.aging.over90', color: 'bg-danger' },
];

const INVOICE_STATUS_VARIANT: Record<SalesInvoiceRegisterRowDto['status'], 'neutral' | 'success' | 'danger'> = {
  draft: 'neutral',
  posted: 'success',
  cancelled: 'danger',
};

/** /sales/customers/:id — Customer 360: balance, aging, open and recent invoices, terms and contact. */
export function CustomerPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: customer, isLoading, isError } = useCustomer(id);

  if (isLoading) {
    return (
      <div className="flex flex-col gap-5">
        <Skeleton className="h-14 w-full rounded-xl" />
        <Skeleton className="h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (isError || !customer) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('sales.customers.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={CUSTOMERS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }

  return <CustomerView customer={customer} />;
}

function CustomerView({ customer }: { customer: CustomerDto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const quotationsEnabled = useHasFeature(FEATURE_KEYS.SALES_QUOTATIONS);
  const { data: summary, isLoading: summaryLoading } = useCustomerAccountSummary(customer.id);
  const { data: openInvoices, isLoading: openLoading } = useSalesInvoiceRegister({
    customerId: customer.id,
    openOnly: true,
  });
  const { data: allInvoices, isLoading: recentLoading } = useSalesInvoiceRegister({ customerId: customer.id });
  const { data: priceLists } = usePriceLists();
  const salesRepName = useSalesRepName(customer.salesRepId);
  const { data: taxRules } = useTaxRuleLookup();
  const { data: definitions } = useCustomFieldDefinitions('customer');
  const deleteCustomer = useDeleteCustomer();

  const recentInvoices = useMemo(
    () =>
      [...(allInvoices ?? [])]
        .sort((a, b) =>
          (b.invoiceDate ?? '').localeCompare(a.invoiceDate ?? '') ||
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        )
        .slice(0, RECENT_LIMIT),
    [allInvoices],
  );

  const sortedOpen = useMemo(
    () => [...(openInvoices ?? [])].sort((a, b) => b.overdueDays - a.overdueDays),
    [openInvoices],
  );

  const priceListName = customer.priceListId
    ? (priceLists ?? []).find((list) => list.id === customer.priceListId)?.name
    : t('priceLists.normalPrices');
  const withholdingName = customer.withholdingTaxRuleId
    ? (taxRules ?? []).find((rule) => rule.id === customer.withholdingTaxRuleId)?.name
    : null;

  const customFieldItems = (definitions ?? [])
    .filter((def) => {
      const value = customer.customFields?.[def.fieldKey];
      return value !== undefined && value !== null && value !== '';
    })
    .map((def) => ({
      label: def.label,
      value: formatCustomValue(customer.customFields[def.fieldKey], t),
      wide: true,
    }));

  const currency = summary?.currency ?? customer.defaultCurrency;
  // Credit limit (migration 0109): available = limit − balance; negative = over the limit.
  const availableCredit =
    customer.creditLimitMinorUnits !== null && summary
      ? (BigInt(customer.creditLimitMinorUnits) - BigInt(summary.balanceMinorUnits)).toString()
      : null;
  const creditExceeded = availableCredit !== null && BigInt(availableCredit) < 0n;

  async function handleDelete() {
    if (!(await confirmDialog(t('sales.customers.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteCustomer.mutateAsync(customer.id);
      toast.success(t('sales.customers.deleteSuccess'));
      navigate(CUSTOMERS_PATH);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const q = `customerId=${customer.id}`;

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={CUSTOMERS_PATH}
        backLabel={t('documents.back')}
        eyebrow={
          <>
            {t('sales.tabs.customers')} · <span className="tabular-nums">{customer.code}</span>
          </>
        }
        title={customer.name}
        status={
          <Badge variant={customer.isActive ? 'success' : 'neutral'} dot>
            {customer.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`${CUSTOMERS_PATH}/${customer.id}/statement`}>
                <FileText />
                {t('statements.title')}
              </Link>
            </Button>
            <Can permission="sales.manage">
              {!customer.isSystemDefault ? (
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={deleteCustomer.isPending}
                  onClick={() => void handleDelete()}
                >
                  {t('common.delete')}
                </Button>
              ) : null}
              <Button variant="outline" asChild>
                <Link to={`${CUSTOMERS_PATH}/${customer.id}/edit`}>
                  <Pencil />
                  {t('common.edit')}
                </Link>
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button>
                    <Plus />
                    {t('sales.customers.newDocument')}
                    <ChevronDown className="opacity-70" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onSelect={() => navigate(`/sales/sales-invoices/new?${q}`)}>
                    {t('sales.salesInvoices.newInvoice')}
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => navigate(`/sales/payments-received/new?${q}`)}>
                    {t('sales.paymentsReceived.newPayment')}
                  </DropdownMenuItem>
                  {quotationsEnabled ? (
                    <DropdownMenuItem onSelect={() => navigate(`/sales/quotations/new?${q}`)}>
                      {t('sales.quotations.newQuotation')}
                    </DropdownMenuItem>
                  ) : null}
                </DropdownMenuContent>
              </DropdownMenu>
            </Can>
          </>
        }
      />

      <DocumentBody
        main={
          <>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <KpiCard
                label={t('sales.customers.kpi.balance')}
                loading={summaryLoading}
                value={<Amount value={summary?.balanceMinorUnits} currency={currency} />}
                hint={
                  summary?.lastPaymentDate
                    ? `${t('sales.customers.lastPayment')}: ${formatDate(summary.lastPaymentDate)}`
                    : undefined
                }
              />
              <KpiCard
                label={t('sales.customers.kpi.overdue')}
                loading={summaryLoading}
                tone={summary && summary.overdueMinorUnits !== '0' ? 'danger' : undefined}
                value={<Amount value={summary?.overdueMinorUnits} currency={currency} zeroAsDash />}
              />
              <KpiCard
                label={t('sales.customers.kpi.unallocated')}
                loading={summaryLoading}
                value={<Amount value={summary?.unallocatedPaymentsMinorUnits} currency={currency} zeroAsDash />}
              />
              <KpiCard
                label={t('sales.customers.kpi.salesThisYear')}
                loading={summaryLoading}
                value={<Amount value={summary?.salesThisYearMinorUnits} currency={currency} zeroAsDash />}
                hint={
                  summary?.lastInvoiceDate
                    ? `${t('sales.customers.lastInvoice')}: ${formatDate(summary.lastInvoiceDate)}`
                    : undefined
                }
              />
            </div>

            {creditExceeded ? (
              <div role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span className="font-medium">{t('sales.customers.creditLimitExceededNotice')}</span>
              </div>
            ) : null}

            <SectionCard title={t('sales.customers.aging')}>
              {summary ? <AgingStrip summary={summary} /> : <Skeleton className="h-16 w-full" />}
            </SectionCard>

            <SectionCard
              title={t('sales.customers.openInvoices')}
              description={
                openInvoices ? `${t('sales.customers.invoiceCount')}: ${openInvoices.length}` : undefined
              }
              flush
            >
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('sales.salesInvoices.invoiceNumber')}</TableHead>
                    <TableHead>{t('sales.salesInvoices.invoiceDate')}</TableHead>
                    <TableHead>{t('sales.salesInvoices.dueDate')}</TableHead>
                    <TableHead className="text-end">{t('sales.customers.outstanding')}</TableHead>
                    <TableHead className="text-end">{t('sales.customers.overdueDays')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sortedOpen.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sales/sales-invoices/${inv.id}`)}
                    >
                      <TableCell className="font-medium tabular-nums">{inv.invoiceNumber}</TableCell>
                      <TableCell className="tabular-nums">{inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}</TableCell>
                      <TableCell className="tabular-nums">{inv.dueDate ? formatDate(inv.dueDate) : '—'}</TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={inv.outstandingMinorUnits} currency={inv.currency} />
                      </TableCell>
                      <TableCell className={cn(AMOUNT_CELL, inv.overdueDays > 0 && 'font-medium text-danger')}>
                        {inv.overdueDays > 0 ? inv.overdueDays : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  <EmptyRow show={!openLoading && sortedOpen.length === 0} colSpan={5} text={t('sales.customers.noOpenInvoices')} />
                  <LoadingRow show={openLoading} colSpan={5} />
                </TableBody>
              </Table>
            </SectionCard>

            <SectionCard title={t('sales.customers.recentInvoices')} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('sales.salesInvoices.invoiceNumber')}</TableHead>
                    <TableHead>{t('sales.salesInvoices.invoiceDate')}</TableHead>
                    <TableHead>{t('common.status')}</TableHead>
                    <TableHead className="text-end">{t('sales.salesInvoices.totalAmount')}</TableHead>
                    <TableHead className="text-end">{t('sales.customers.outstanding')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentInvoices.map((inv) => (
                    <TableRow
                      key={inv.id}
                      className="cursor-pointer"
                      onClick={() => navigate(`/sales/sales-invoices/${inv.id}`)}
                    >
                      <TableCell className="font-medium tabular-nums">{inv.invoiceNumber}</TableCell>
                      <TableCell className="tabular-nums">{inv.invoiceDate ? formatDate(inv.invoiceDate) : '—'}</TableCell>
                      <TableCell>
                        <Badge variant={INVOICE_STATUS_VARIANT[inv.status]} dot>
                          {t(`sales.salesInvoices.status.${inv.status}`)}
                        </Badge>
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={inv.totalMinorUnits} currency={inv.currency} />
                      </TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={inv.outstandingMinorUnits} hideCurrency zeroAsDash />
                      </TableCell>
                    </TableRow>
                  ))}
                  <EmptyRow show={!recentLoading && recentInvoices.length === 0} colSpan={5} text={t('sales.customers.noInvoices')} />
                  <LoadingRow show={recentLoading} colSpan={5} />
                </TableBody>
              </Table>
            </SectionCard>
          </>
        }
        side={
          <>
            <SectionCard title={t('sales.customers.sections.contact')}>
              <InfoGrid
                items={[
                  {
                    label: t('sales.customers.customerType'),
                    value:
                      customer.customerType === 'business'
                        ? t('sales.customers.customerTypeBusiness')
                        : t('sales.customers.customerTypeIndividual'),
                    wide: true,
                  },
                  { label: t('sales.customers.contactPerson'), value: customer.contactPerson, wide: true },
                  {
                    label: t('sales.customers.phone'),
                    value: customer.phone ? <span dir="ltr">{customer.phone}</span> : null,
                    wide: true,
                  },
                  {
                    label: t('sales.customers.email'),
                    value: customer.email ? <span dir="ltr">{customer.email}</span> : null,
                    wide: true,
                  },
                  { label: t('sales.customers.address'), value: customer.address, wide: true },
                ]}
              />
            </SectionCard>

            <SectionCard title={t('sales.customers.sections.financial')}>
              <InfoGrid
                items={[
                  { label: t('sales.customers.defaultCurrency'), value: customer.defaultCurrency, wide: true },
                  {
                    label: t('sales.customers.paymentTermsDays'),
                    value: customer.paymentTermsDays ?? null,
                    wide: true,
                  },
                  {
                    label: t('sales.customers.creditLimit'),
                    value:
                      customer.creditLimitMinorUnits === null ? (
                        t('sales.customers.creditLimitUnlimited')
                      ) : (
                        <Amount value={customer.creditLimitMinorUnits} currency={customer.defaultCurrency} />
                      ),
                    wide: true,
                  },
                  ...(availableCredit !== null
                    ? [
                        {
                          label: t('sales.customers.availableCredit'),
                          value: (
                            <Amount
                              value={availableCredit}
                              currency={customer.defaultCurrency}
                              className={creditExceeded ? 'text-danger' : undefined}
                            />
                          ),
                          wide: true,
                        },
                      ]
                    : []),
                  { label: t('priceLists.customerDefault'), value: priceListName, wide: true },
                  { label: t('salesReps.customerDefault'), value: salesRepName, wide: true },
                  {
                    label: t('sales.customers.taxNumber'),
                    value: customer.taxNumber ? <span className="tabular-nums">{customer.taxNumber}</span> : null,
                    wide: true,
                  },
                  ...(withholdingName
                    ? [{ label: t('taxes.partyWithholding'), value: withholdingName, wide: true }]
                    : []),
                ]}
              />
            </SectionCard>

            {customer.notes || customFieldItems.length > 0 ? (
              <SectionCard title={t('sales.customers.sections.other')}>
                <InfoGrid
                  items={[
                    ...(customer.notes
                      ? [{ label: t('sales.customers.notes'), value: <span className="whitespace-pre-line">{customer.notes}</span>, wide: true }]
                      : []),
                    ...customFieldItems,
                  ]}
                />
              </SectionCard>
            ) : null}

            <PanelCard>
              <AttachmentsPanel entityType="customer" entityId={customer.id} />
            </PanelCard>

            <DocumentHistory entityType="customer" entityId={customer.id} />
          </>
        }
      />
    </div>
  );
}

function formatCustomValue(value: unknown, t: (key: string) => string): ReactNode {
  if (typeof value === 'boolean') return value ? t('common.yes') : t('common.no');
  if (Array.isArray(value)) return value.join('، ');
  return String(value);
}

function KpiCard({
  label,
  value,
  hint,
  loading,
  tone,
}: {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  loading?: boolean;
  tone?: 'danger';
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1 rounded-xl border bg-card p-4 shadow-card">
      <span className="text-[13px] text-muted-foreground">{label}</span>
      {loading ? (
        <Skeleton className="h-7 w-24" />
      ) : (
        <span className={cn('text-xl font-bold', tone === 'danger' && 'text-danger')}>{value}</span>
      )}
      {hint ? <span className="truncate text-xs text-muted-foreground">{hint}</span> : null}
    </div>
  );
}

/** The five aging buckets as one proportional bar plus a legend with each bucket's amount. */
function AgingStrip({ summary }: { summary: CustomerAccountSummaryDto }) {
  const { t } = useTranslation();
  const amounts = new Map(summary.aging.map((row) => [row.bucket, row.amountMinorUnits]));
  const positive = (value: string | undefined) => {
    const n = BigInt(value ?? '0');
    return n > 0n ? n : 0n;
  };
  const total = AGING_BUCKETS.reduce((sum, b) => sum + positive(amounts.get(b.bucket)), 0n);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-muted">
        {total > 0n
          ? AGING_BUCKETS.map((b) => {
              const share = Number((positive(amounts.get(b.bucket)) * 10000n) / total) / 100;
              return share > 0 ? (
                <div key={b.bucket} className={b.color} style={{ width: `${share}%` }} title={t(b.labelKey)} />
              ) : null;
            })
          : null}
      </div>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        {AGING_BUCKETS.map((b) => (
          <div key={b.bucket} className="flex min-w-0 flex-col gap-0.5">
            <dt className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
              <span className={cn('h-2 w-2 shrink-0 rounded-full', b.color)} />
              {t(b.labelKey)}
            </dt>
            <dd className="font-medium">
              <Amount value={amounts.get(b.bucket) ?? '0'} hideCurrency zeroAsDash />
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function EmptyRow({ show, colSpan, text }: { show: boolean; colSpan: number; text: string }) {
  if (!show) return null;
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan} className="h-20 text-center text-muted-foreground">
        {text}
      </TableCell>
    </TableRow>
  );
}

function LoadingRow({ show, colSpan }: { show: boolean; colSpan: number }) {
  if (!show) return null;
  return (
    <TableRow className="hover:bg-transparent">
      <TableCell colSpan={colSpan}>
        <Skeleton className="h-8 w-full" />
      </TableCell>
    </TableRow>
  );
}
