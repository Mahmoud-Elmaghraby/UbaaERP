import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import type { AgingBucketsDto, SupplierDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
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
import { Banknote, FileQuestion, FileText, Pencil, ShoppingCart, Trash2 } from 'lucide-react';

import { AttachmentsPanel } from '../../../attachments/components/attachments-panel';
import { useTaxRuleLookup } from '../../../settings/queries';
import { usePartyBalances } from '../../../statements/queries';
import { useDeleteSupplier, useSupplier } from '../../api/suppliers/queries';
import { useSupplierOutstandingInvoices } from '../../api/supplier-payments/queries';
import { usePurchaseOrders } from '../../api/purchase-orders/queries';
import { toSupplierOpenRows } from '../../lib/supplier-open-invoices';
import { usePriceLists } from '../../../sales/api/price-lists/queries';
import { ApiError } from '../../../../lib/api-client';
import { FEATURE_KEYS } from '../../../../lib/feature-keys';
import { formatDate } from '../../../../lib/format-date';
import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { confirmDialog } from '../../../../components/feedback/confirm-dialog';
import { DocumentBody, DocumentHeaderBar, InfoGrid, PanelCard, SectionCard } from '../../../../components/document/document-layout';
import { DocumentHistory } from '../../../../components/document/document-history';
import { PURCHASE_ORDER_STATUS_VARIANT, purchaseOrderStatusLabelKey } from '../purchase-orders/purchase-order-status';
import { SUPPLIERS_PATH } from './supplier-paths';

const AGING_KEYS = ['current', 'days1To30', 'days31To60', 'days61To90', 'over90'] as const;

/** /purchases/suppliers/:id — balance and aging, open invoices, recent orders, and the supplier's details. */
export function SupplierPage() {
  const { t } = useTranslation();
  const { id } = useParams<{ id: string }>();
  const { data: supplier, isLoading, isError } = useSupplier(id);

  if (isLoading) return <Skeleton className="h-96 w-full rounded-xl" />;
  if (isError || !supplier) {
    return (
      <EmptyState
        icon={<FileQuestion />}
        title={t('purchases.suppliers.notFound')}
        action={
          <Button variant="outline" asChild>
            <Link to={SUPPLIERS_PATH}>{t('documents.back')}</Link>
          </Button>
        }
      />
    );
  }
  return <SupplierProfile supplier={supplier} />;
}

function SupplierProfile({ supplier }: { supplier: SupplierDto }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const ordersEnabled = useHasFeature(FEATURE_KEYS.PURCHASES_PURCHASE_ORDERS);
  const { data: balances, isLoading: balanceLoading } = usePartyBalances('supplier', { nonZeroOnly: false });
  const { data: outstanding, isLoading: outstandingLoading } = useSupplierOutstandingInvoices(supplier.id);
  const { data: orders } = usePurchaseOrders();
  const { data: taxRules } = useTaxRuleLookup();
  const deleteSupplier = useDeleteSupplier();

  const balanceRow = balances?.rows.find((row) => row.partyId === supplier.id);
  const openRows = useMemo(
    () => toSupplierOpenRows(outstanding ?? [], supplier.defaultCurrency),
    [outstanding, supplier.defaultCurrency],
  );
  const recentOrders = useMemo(
    () =>
      (orders ?? [])
        .filter((o) => o.supplierId === supplier.id)
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, 8),
    [orders, supplier.id],
  );
  const withholdingName = taxRules?.find((rule) => rule.id === supplier.withholdingTaxRuleId)?.name;
  const { data: priceLists } = usePriceLists('purchase');
  const priceListName = priceLists?.find((list) => list.id === supplier.priceListId)?.name;

  async function handleDelete() {
    if (!(await confirmDialog(t('purchases.suppliers.deleteConfirm'), { tone: 'danger' }))) return;
    try {
      await deleteSupplier.mutateAsync(supplier.id);
      toast.success(t('purchases.suppliers.deleteSuccess'));
      navigate(SUPPLIERS_PATH, { replace: true });
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="flex flex-col">
      <DocumentHeaderBar
        backTo={SUPPLIERS_PATH}
        backLabel={t('documents.back')}
        eyebrow={t('purchases.tabs.suppliers')}
        title={supplier.name}
        status={
          <Badge variant={supplier.isActive ? 'success' : 'neutral'} dot>
            {supplier.isActive ? t('common.active') : t('common.inactive')}
          </Badge>
        }
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to={`${SUPPLIERS_PATH}/${supplier.id}/statement`}>
                <FileText />
                {t('purchases.suppliers.statement')}
              </Link>
            </Button>
            <Can permission="purchases.manage">
              <>
                <Button
                  variant="ghost"
                  className="text-danger hover:bg-danger-soft hover:text-danger"
                  disabled={deleteSupplier.isPending}
                  onClick={() => void handleDelete()}
                >
                  <Trash2 />
                  {t('common.delete')}
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`${SUPPLIERS_PATH}/${supplier.id}/edit`}>
                    <Pencil />
                    {t('common.edit')}
                  </Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to={`/purchases/supplier-payments/new?supplierId=${supplier.id}`}>
                    <Banknote />
                    {t('purchases.suppliers.newPayment')}
                  </Link>
                </Button>
                {ordersEnabled ? (
                  <Button asChild>
                    <Link to={`/purchases/purchase-orders/new?supplierId=${supplier.id}`}>
                      <ShoppingCart />
                      {t('purchases.suppliers.newOrder')}
                    </Link>
                  </Button>
                ) : (
                  <Button asChild>
                    <Link to="/purchases/purchase-invoices/new">
                      <ShoppingCart />
                      {t('purchases.purchaseInvoices.newInvoice')}
                    </Link>
                  </Button>
                )}
              </>
            </Can>
          </>
        }
      />

      <DocumentBody
        main={
          <>
            <SectionCard
              title={t('statements.balances.balance')}
              actions={
                balanceRow ? (
                  <span className="text-lg font-bold">
                    <Amount value={balanceRow.balance.amountMinorUnits} currency={balanceRow.balance.currency} />
                  </span>
                ) : null
              }
            >
              {balanceLoading ? (
                <Skeleton className="h-16 w-full" />
              ) : balanceRow ? (
                <AgingGrid aging={balanceRow.aging} />
              ) : (
                <p className="text-sm text-muted-foreground">{t('purchases.suppliers.noBalance')}</p>
              )}
            </SectionCard>

            <SectionCard title={t('purchases.suppliers.openInvoices')} description={`${openRows.length}`} flush>
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>{t('documents.allocation.invoiceNumber')}</TableHead>
                    <TableHead>{t('documents.allocation.invoiceDate')}</TableHead>
                    <TableHead>{t('documents.allocation.dueDate')}</TableHead>
                    <TableHead className="text-end">{t('documents.allocation.outstanding')}</TableHead>
                    <TableHead className="text-end">{t('purchases.suppliers.overdueDays')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {openRows.map((row) => (
                    <TableRow key={row.id} className="cursor-pointer" onClick={() => navigate(row.href)}>
                      <TableCell className="font-medium tabular-nums">{row.number}</TableCell>
                      <TableCell className="tabular-nums">{formatDate(row.invoiceDate)}</TableCell>
                      <TableCell className="tabular-nums">{formatDate(row.dueDate)}</TableCell>
                      <TableCell className={AMOUNT_CELL}>
                        <Amount value={row.outstandingMinorUnits} hideCurrency />
                      </TableCell>
                      <TableCell className={cn(AMOUNT_CELL, (row.overdueDays ?? 0) > 0 && 'font-medium text-danger')}>
                        {(row.overdueDays ?? 0) > 0 ? row.overdueDays : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                  {!outstandingLoading && openRows.length === 0 ? (
                    <TableRow className="hover:bg-transparent">
                      <TableCell colSpan={5} className="h-16 text-center text-muted-foreground">
                        {t('purchases.supplierPayments.noOutstandingInvoices')}
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </SectionCard>

            {ordersEnabled ? (
              <SectionCard title={t('purchases.suppliers.recentOrders')} flush>
                <Table>
                  <TableHeader>
                    <TableRow className="hover:bg-transparent">
                      <TableHead>{t('purchases.purchaseOrders.poNumber')}</TableHead>
                      <TableHead>{t('documents.date')}</TableHead>
                      <TableHead>{t('common.status')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentOrders.map((order) => (
                      <TableRow key={order.id} className="cursor-pointer" onClick={() => navigate(`/purchases/purchase-orders/${order.id}`)}>
                        <TableCell className="font-medium tabular-nums">{order.poNumber}</TableCell>
                        <TableCell className="tabular-nums">{formatDate(order.createdAt)}</TableCell>
                        <TableCell>
                          <Badge variant={PURCHASE_ORDER_STATUS_VARIANT[order.status]} dot>
                            {t(purchaseOrderStatusLabelKey(order.status))}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                    {recentOrders.length === 0 ? (
                      <TableRow className="hover:bg-transparent">
                        <TableCell colSpan={3} className="h-16 text-center text-muted-foreground">
                          {t('purchases.suppliers.noOrders')}
                        </TableCell>
                      </TableRow>
                    ) : null}
                  </TableBody>
                </Table>
              </SectionCard>
            ) : null}

            <PanelCard>
              <AttachmentsPanel entityType="supplier" entityId={supplier.id} />
            </PanelCard>
          </>
        }
        side={
          <>
            <SectionCard title={t('purchases.suppliers.sections.contact')}>
              <InfoGrid
                items={[
                  { label: t('purchases.suppliers.code'), value: <span className="tabular">{supplier.code}</span>, wide: true },
                  ...(supplier.contactPerson ? [{ label: t('purchases.suppliers.contactPerson'), value: supplier.contactPerson, wide: true }] : []),
                  ...(supplier.phone ? [{ label: t('purchases.suppliers.phone'), value: <span dir="ltr">{supplier.phone}</span>, wide: true }] : []),
                  ...(supplier.email ? [{ label: t('purchases.suppliers.email'), value: <span dir="ltr">{supplier.email}</span>, wide: true }] : []),
                  ...(supplier.address ? [{ label: t('purchases.suppliers.address'), value: supplier.address, wide: true }] : []),
                ]}
              />
            </SectionCard>
            <SectionCard title={t('purchases.suppliers.sections.financial')}>
              <InfoGrid
                items={[
                  { label: t('purchases.suppliers.defaultCurrency'), value: supplier.defaultCurrency, wide: true },
                  {
                    label: t('purchases.suppliers.paymentTermsDays'),
                    value: supplier.paymentTermsDays ?? '—',
                    wide: true,
                  },
                  ...(priceListName ? [{ label: t('priceLists.supplierDefault'), value: priceListName, wide: true }] : []),
                  ...(supplier.taxNumber ? [{ label: t('purchases.suppliers.taxNumber'), value: <span dir="ltr">{supplier.taxNumber}</span>, wide: true }] : []),
                  ...(withholdingName ? [{ label: t('taxes.partyWithholding'), value: withholdingName, wide: true }] : []),
                  ...(supplier.notes ? [{ label: t('purchases.suppliers.notes'), value: supplier.notes, wide: true }] : []),
                ]}
              />
            </SectionCard>
            <DocumentHistory entityType="supplier" entityId={supplier.id} />
          </>
        }
      />
    </div>
  );
}

function AgingGrid({ aging }: { aging: AgingBucketsDto }) {
  const { t } = useTranslation();
  const hasCredit = BigInt(aging.unappliedCredit.amountMinorUnits) !== 0n;
  return (
    <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">
      {AGING_KEYS.map((key) => (
        <div key={key} className="flex min-w-0 flex-col gap-0.5">
          <dt className={cn('text-[13px] text-muted-foreground', key === 'over90' && 'text-danger')}>{t(`statements.aging.${key}`)}</dt>
          <dd className="font-medium">
            <Amount value={aging[key].amountMinorUnits} hideCurrency zeroAsDash />
          </dd>
        </div>
      ))}
      {hasCredit ? (
        <div className="col-span-2 flex flex-col gap-0.5 sm:col-span-5">
          <dt className="text-[13px] text-muted-foreground">{t('statements.aging.unappliedCredit')}</dt>
          <dd className="font-medium">
            <Amount value={aging.unappliedCredit.amountMinorUnits} hideCurrency />
          </dd>
        </div>
      ) : null}
    </dl>
  );
}
