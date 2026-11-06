import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, HandCoins } from 'lucide-react';
import type { CustomerDto, CustomerRefundDto, RefundMethodDto } from '@erp-platform/contracts';
import { refundMethodSchema } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { Amount, AMOUNT_CELL } from '../../../../components/amount';
import { SectionCard } from '../../../../components/document/document-layout';
import { TreasurySelect } from '../../../../components/document/treasury-select';
import { ApiError } from '../../../../lib/api-client';
import { formatDate, todayIso } from '../../../../lib/format-date';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../../lib/money';
import {
  useCancelCustomerRefund,
  useCreateCustomerRefund,
  useCustomerRefundableCredit,
  useCustomerRefunds,
} from '../../api/customer-refunds/queries';

const METHODS = refundMethodSchema.options;

/** "رد مبلغ" — shown on the customer page when the customer holds credit in their currency. */
export function CustomerRefundAction({ customer }: { customer: CustomerDto }) {
  const { t } = useTranslation();
  const { data: available } = useCustomerRefundableCredit(customer.id, customer.defaultCurrency);
  const [open, setOpen] = useState(false);
  if (!available || BigInt(available.amountMinorUnits) <= 0n) return null;
  return (
    <Can permission="sales.manage">
      <Button variant="outline" onClick={() => setOpen(true)}>
        <HandCoins />
        {t('sales.customerRefunds.action')}
      </Button>
      <CustomerRefundDialog
        customer={customer}
        availableMinorUnits={available.amountMinorUnits}
        open={open}
        onOpenChange={setOpen}
      />
    </Can>
  );
}

/**
 * رد مبلغ لعميل — pays the customer's credit back (all or part) out of a
 * treasury: amount (at most the credit), method, treasury, date, reference.
 */
function CustomerRefundDialog({
  customer,
  availableMinorUnits,
  open,
  onOpenChange,
}: {
  customer: CustomerDto;
  availableMinorUnits: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const create = useCreateCustomerRefund();
  const currency = customer.defaultCurrency;
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<RefundMethodDto>('cash');
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [refundDate, setRefundDate] = useState(todayIso());
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setAmount(minorUnitsToDecimalString(availableMinorUnits));
    setMethod('cash');
    setRefundDate(todayIso());
    setReference('');
    setNotes('');
    setError(null);
  }, [open, availableMinorUnits]);

  async function submit() {
    setError(null);
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(amount);
    } catch {
      setError(t('sales.customerRefunds.amountError'));
      return;
    }
    if (BigInt(amountMinorUnits) <= 0n) {
      setError(t('sales.customerRefunds.amountError'));
      return;
    }
    if (BigInt(amountMinorUnits) > BigInt(availableMinorUnits)) {
      setError(t('sales.customerRefunds.exceedsCredit'));
      return;
    }
    try {
      await create.mutateAsync({
        customerId: customer.id,
        amount: { amountMinorUnits, currency },
        paymentMethod: method,
        treasuryId,
        refundDate: refundDate || null,
        reference: reference.trim() || null,
        notes: notes.trim() || null,
      });
      toast.success(t('sales.customerRefunds.success'));
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sales.customerRefunds.title')}</DialogTitle>
          <DialogDescription>
            {t('sales.customerRefunds.available')}: <Amount value={availableMinorUnits} currency={currency} />
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('sales.customerRefunds.amount', { currency })}</span>
            <Input inputMode="decimal" className="tabular-nums" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('sales.customerRefunds.method')}</span>
              <Select value={method} onValueChange={(v) => setMethod(v as RefundMethodDto)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`sales.paymentsReceived.paymentMethodValue.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('sales.customerRefunds.date')}</span>
              <Input type="date" value={refundDate} onChange={(e) => setRefundDate(e.target.value)} />
            </div>
          </div>
          <TreasurySelect value={treasuryId} onChange={setTreasuryId} currency={currency} paymentMethod={method} />
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('sales.customerRefunds.reference')}</span>
            <Input value={reference} maxLength={120} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <span className="text-sm font-medium">{t('sales.customerRefunds.notes')}</span>
            <Textarea rows={2} value={notes} maxLength={1000} onChange={(e) => setNotes(e.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => void submit()} disabled={create.isPending}>
            {t('sales.customerRefunds.submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** The customer's refunds, with cancel (a reason is required). Hidden while there are none. */
export function CustomerRefundsSection({ customerId }: { customerId: string }) {
  const { t } = useTranslation();
  const { data: refunds, isLoading } = useCustomerRefunds(customerId);
  const [cancelling, setCancelling] = useState<CustomerRefundDto | null>(null);

  if (isLoading) return <Skeleton className="h-24 w-full rounded-xl" />;
  if (!refunds || refunds.length === 0) return null;

  return (
    <SectionCard title={t('sales.customerRefunds.listTitle')} flush>
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            <TableHead>{t('sales.customerRefunds.number')}</TableHead>
            <TableHead>{t('sales.customerRefunds.date')}</TableHead>
            <TableHead>{t('sales.customerRefunds.method')}</TableHead>
            <TableHead>{t('common.status')}</TableHead>
            <TableHead className="text-end">{t('sales.customerRefunds.amountColumn')}</TableHead>
            <TableHead className="w-0" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {refunds.map((refund) => (
            <TableRow key={refund.id}>
              <TableCell className="font-medium tabular-nums">
                {refund.refundNumber}
                {refund.reference ? <span className="ms-2 text-xs text-muted-foreground">{refund.reference}</span> : null}
              </TableCell>
              <TableCell className="tabular-nums">{formatDate(refund.refundDate)}</TableCell>
              <TableCell>
                {t(`sales.paymentsReceived.paymentMethodValue.${refund.paymentMethod}`)}
                {refund.treasuryName ? <span className="text-muted-foreground"> · {refund.treasuryName}</span> : null}
              </TableCell>
              <TableCell>
                <Badge
                  variant={refund.status === 'posted' ? 'success' : 'danger'}
                  dot
                  title={refund.cancelReason ?? undefined}
                >
                  {t(`sales.customerRefunds.status.${refund.status}`)}
                </Badge>
              </TableCell>
              <TableCell className={AMOUNT_CELL}>
                <Amount
                  value={refund.amount.amountMinorUnits}
                  currency={refund.amount.currency}
                  className={refund.status === 'cancelled' ? 'line-through opacity-60' : undefined}
                />
              </TableCell>
              <TableCell>
                {refund.status === 'posted' ? (
                  <Can permission="sales.manage">
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      className="text-danger hover:bg-danger-soft hover:text-danger"
                      onClick={() => setCancelling(refund)}
                      title={t('sales.customerRefunds.cancel')}
                      aria-label={t('sales.customerRefunds.cancel')}
                    >
                      <Ban />
                    </Button>
                  </Can>
                ) : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <CancelRefundDialog refund={cancelling} onClose={() => setCancelling(null)} />
    </SectionCard>
  );
}

function CancelRefundDialog({ refund, onClose }: { refund: CustomerRefundDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const cancel = useCancelCustomerRefund();
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (refund) setReason('');
  }, [refund]);

  async function submit() {
    if (!refund || !reason.trim()) return;
    try {
      await cancel.mutateAsync({ id: refund.id, reason: reason.trim() });
      toast.success(t('sales.customerRefunds.cancelled'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={Boolean(refund)} onOpenChange={(next) => (!next ? onClose() : undefined)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('sales.customerRefunds.cancelTitle', { number: refund?.refundNumber ?? '' })}</DialogTitle>
          <DialogDescription>{t('sales.customerRefunds.cancelDescription')}</DialogDescription>
        </DialogHeader>
        <Textarea
          autoFocus
          rows={3}
          maxLength={500}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('sales.customerRefunds.cancelReason')}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button variant="destructive" onClick={() => void submit()} disabled={!reason.trim() || cancel.isPending}>
            {t('sales.customerRefunds.cancel')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
