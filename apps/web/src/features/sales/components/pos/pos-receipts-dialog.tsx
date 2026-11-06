import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Printer, Receipt, Search, Undo2 } from 'lucide-react';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  EmptyState,
  Input,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@erp-platform/ui';

import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { openPrint } from '../../../../components/printing/print-button';
import { usePosSessionSales } from '../../api/pos/queries';

function timeOf(value: Date | string): string {
  return new Date(value).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

/**
 * الإيصالات — the shift's sales, newest first: reprint on the thermal printer,
 * or start a return on one. Typing a number (or scanning the receipt) filters
 * the list; Enter on a number not in this shift opens the return lookup.
 */
export function PosReceiptsDialog({
  sessionId,
  open,
  onOpenChange,
  onReturn,
}: {
  sessionId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onReturn: (invoiceNumber: string) => void;
}) {
  const { t } = useTranslation();
  const { data: sales, isLoading } = usePosSessionSales(sessionId, open);
  const [filter, setFilter] = useState('');

  const rows = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    const list = [...(sales ?? [])].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    if (!needle) return list;
    return list.filter(
      (s) => s.invoiceNumber.toLowerCase().includes(needle) || s.customerName.toLowerCase().includes(needle),
    );
  }, [sales, filter]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-4xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pos.receipts.title')}</DialogTitle>
          <DialogDescription>{t('pos.receipts.description')}</DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            className="h-11 ps-9"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && filter.trim() !== '' && rows.length === 0) {
                e.preventDefault();
                onReturn(filter.trim());
              }
            }}
            placeholder={t('pos.receipts.searchPlaceholder')}
          />
        </div>

        {isLoading ? (
          <Skeleton className="h-48 w-full" />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={<Receipt />}
            title={filter ? t('common.noResults') : t('pos.receipts.empty')}
            action={
              filter.trim() ? (
                <Can permission="sales.manage">
                  <Button variant="outline" onClick={() => onReturn(filter.trim())}>
                    <Undo2 />
                    {t('pos.receipts.returnByNumber', { number: filter.trim() })}
                  </Button>
                </Can>
              ) : undefined
            }
          />
        ) : (
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>{t('pos.checkout.invoiceNumber')}</TableHead>
                  <TableHead>{t('pos.receipts.time')}</TableHead>
                  <TableHead>{t('pos.customer.label')}</TableHead>
                  <TableHead className="text-end">{t('sales.salesOrders.totalAmount')}</TableHead>
                  <TableHead>{t('pos.tenders.title')}</TableHead>
                  <TableHead className="w-0" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((sale) => (
                  <TableRow key={sale.salesInvoiceId}>
                    <TableCell className="font-medium tabular-nums">
                      <div className="flex items-center gap-2">
                        {sale.invoiceNumber}
                        {sale.hasReturns ? <Badge variant="warning">{t('pos.receipts.returned')}</Badge> : null}
                      </div>
                    </TableCell>
                    <TableCell className="tabular-nums">{timeOf(sale.createdAt)}</TableCell>
                    <TableCell className="max-w-40 truncate">{sale.customerName}</TableCell>
                    <TableCell className={AMOUNT_CELL}>
                      <Amount value={sale.total.amountMinorUnits} currency={sale.total.currency} className="font-semibold" />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {sale.tenders.map((tender, i) => (
                          <Badge key={i} variant="neutral">
                            {t(`sales.paymentsReceived.paymentMethodValue.${tender.paymentMethod}`)}
                          </Badge>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            openPrint('sales_invoice', sale.salesInvoiceId, { paper: 'thermal80', autoprint: true })
                          }
                          title={t('printing.printReceipt')}
                          aria-label={t('printing.printReceipt')}
                        >
                          <Printer />
                        </Button>
                        <Can permission="sales.manage">
                          <Button variant="outline" onClick={() => onReturn(sale.invoiceNumber)}>
                            <Undo2 />
                            {t('pos.return.action')}
                          </Button>
                        </Can>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
