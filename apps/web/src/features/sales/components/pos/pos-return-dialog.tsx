import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, Minus, Plus, Printer, Search } from 'lucide-react';
import type { PosReturnResultDto, PosSaleForReturnDto, PosSessionDto, RefundMethodDto } from '@erp-platform/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  Textarea,
  cn,
  toast,
} from '@erp-platform/ui';

import { Amount } from '../../../../components/amount';
import { TreasurySelect } from '../../../../components/document/treasury-select';
import { openPrint } from '../../../../components/printing/print-button';
import { ApiError } from '../../../../lib/api-client';
import { multiplyMinorUnits, sumMinorUnits } from '../../../../lib/money';
import { fetchPosSaleForReturn, usePosReturn } from '../../api/pos/queries';
import { isApprovalCancelled, useSupervisorApproval } from './use-supervisor-approval';

type RefundMode = 'cash' | 'same' | 'credit';
const NON_CASH_METHODS: RefundMethodDto[] = ['card', 'bank_transfer', 'other'];

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

/**
 * مرتجع — a return on a receipt of any shift: find the sale by its number
 * (typed or scanned), pick how many of each line come back (0..returnable),
 * and how the customer gets the money: cash from this drawer, the way they
 * paid (card / transfer → a treasury), or kept as their credit. A supervisor
 * PIN is asked for when the API wants one.
 */
export function PosReturnDialog({
  session,
  open,
  onOpenChange,
  initialNumber,
}: {
  session: PosSessionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialNumber: string;
}) {
  const { t } = useTranslation();
  const posReturn = usePosReturn();
  const approval = useSupervisorApproval();
  const [number, setNumber] = useState(initialNumber);
  const [sale, setSale] = useState<PosSaleForReturnDto | null>(null);
  const [loading, setLoading] = useState(false);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<RefundMode>('cash');
  const [method, setMethod] = useState<RefundMethodDto>('card');
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [result, setResult] = useState<PosReturnResultDto | null>(null);

  async function lookup(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    setLoading(true);
    setLookupError(null);
    setSale(null);
    setResult(null);
    try {
      const found = await fetchPosSaleForReturn(trimmed);
      setSale(found);
      setQuantities({});
      setReasons({});
      const paidOther = found.tenders.find((tender) => tender.paymentMethod !== 'cash');
      const otherMethod = NON_CASH_METHODS.find((m) => m === paidOther?.paymentMethod);
      setMethod(otherMethod ?? 'card');
      setMode(found.total.currency === session.openingCashAmount.currency ? 'cash' : 'credit');
    } catch (err) {
      setLookupError(err instanceof ApiError ? err.message : t('common.error'));
    } finally {
      setLoading(false);
    }
  }

  // Opening on a receipt looks it up straight away.
  useEffect(() => {
    if (!open) return;
    setNumber(initialNumber);
    setSale(null);
    setResult(null);
    setLookupError(null);
    setNotes('');
    if (initialNumber) void lookup(initialNumber);
  }, [open, initialNumber]);

  const currency = sale?.total.currency ?? session.openingCashAmount.currency;
  const chosen = (sale?.lines ?? []).filter((line) => (quantities[line.deliveryLineId] ?? 0) > 0);
  const refundTotal = sumMinorUnits(
    chosen.map((line) => multiplyMinorUnits(line.unitAmount.amountMinorUnits, quantities[line.deliveryLineId] ?? 0)),
  );
  const anythingReturnable = (sale?.lines ?? []).some((line) => line.returnableQuantity > 0);
  const cashAllowed = currency === session.openingCashAmount.currency;

  function setQty(lineId: string, value: number, max: number) {
    const next = Math.min(Math.max(0, round3(value)), max);
    setQuantities((prev) => ({ ...prev, [lineId]: Number.isFinite(next) ? next : 0 }));
  }

  async function submit() {
    if (!sale || chosen.length === 0) return;
    const refund =
      mode === 'credit'
        ? null
        : mode === 'cash'
          ? { paymentMethod: 'cash' as const }
          : { paymentMethod: method, treasuryId };
    try {
      const done = await approval.run((approvalPin) =>
        posReturn.mutateAsync({
          sessionId: session.id,
          input: {
            deliveryId: sale.deliveryId,
            lines: chosen.map((line) => ({
              deliveryLineId: line.deliveryLineId,
              quantity: quantities[line.deliveryLineId]!,
              reason: reasons[line.deliveryLineId]?.trim() || null,
            })),
            refund,
            approvalPin: approvalPin ?? null,
            notes: notes.trim() || null,
          },
        }),
      );
      setResult(done);
      toast.success(t('pos.return.success'));
    } catch (err) {
      if (isApprovalCancelled(err)) return;
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[92vh] max-w-3xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('pos.return.title')}</DialogTitle>
            <DialogDescription>{t('pos.return.description')}</DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="grid gap-4">
              <div className="flex flex-col items-center gap-2 rounded-xl bg-success-soft p-6 text-center">
                <CheckCircle2 className="h-10 w-10 text-success" />
                <p className="text-lg font-semibold">{t('pos.return.doneTitle', { number: result.returnNumber })}</p>
                <Amount value={result.amount.amountMinorUnits} currency={result.amount.currency} className="text-3xl font-bold" />
                <p className="text-sm text-muted-foreground">
                  {result.refund
                    ? t('pos.return.refundedVia', {
                        method: t(`sales.paymentsReceived.paymentMethodValue.${result.refund.paymentMethod}`),
                      })
                    : t('pos.return.keptAsCredit')}
                </p>
                <p className="text-xs text-muted-foreground">
                  {t('pos.return.creditNote')}: <span className="tabular-nums">{result.creditNoteNumber}</span>
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  className="h-12"
                  onClick={() => openPrint('sales_credit_note', result.creditNoteId, { paper: 'thermal80', autoprint: true })}
                >
                  <Printer />
                  {t('pos.return.printCreditNote')}
                </Button>
                <Button className="h-12" onClick={() => onOpenChange(false)}>
                  {t('common.close')}
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid gap-4">
              <form
                className="flex gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void lookup(number);
                }}
              >
                <Input
                  autoFocus={!initialNumber}
                  className="h-11 tabular-nums"
                  value={number}
                  onChange={(e) => setNumber(e.target.value)}
                  placeholder={t('pos.return.numberPlaceholder')}
                  dir="ltr"
                />
                <Button type="submit" className="h-11" disabled={loading || !number.trim()}>
                  <Search />
                  {t('pos.return.find')}
                </Button>
              </form>

              {loading ? <Skeleton className="h-40 w-full" /> : null}
              {lookupError ? <p className="text-sm text-destructive">{lookupError}</p> : null}

              {sale ? (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2 text-sm">
                    <span>
                      <span className="font-semibold tabular-nums">{sale.invoiceNumber}</span> · {sale.customerName}
                    </span>
                    <Amount value={sale.total.amountMinorUnits} currency={sale.total.currency} />
                  </div>

                  {!anythingReturnable ? (
                    <p className="text-sm text-muted-foreground">{t('pos.return.nothingLeft')}</p>
                  ) : null}

                  <ul className="grid gap-2">
                    {sale.lines.map((line) => {
                      const qty = quantities[line.deliveryLineId] ?? 0;
                      const max = line.returnableQuantity;
                      return (
                        <li
                          key={line.deliveryLineId}
                          className={cn('grid gap-2 rounded-lg border p-3', qty > 0 && 'border-primary/50 bg-accent/30', max <= 0 && 'opacity-60')}
                        >
                          <div className="flex flex-wrap items-center gap-3">
                            <div className="grid min-w-0 flex-1">
                              <span className="truncate font-medium">{line.productName}</span>
                              <span className="text-xs text-muted-foreground">
                                {t('pos.return.soldReturnable', { sold: line.quantity, returnable: max })} ·{' '}
                                <Amount value={line.unitAmount.amountMinorUnits} currency={line.unitAmount.currency} />
                              </span>
                            </div>
                            <div className="flex items-center gap-1" dir="ltr">
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11"
                                disabled={max <= 0 || qty <= 0}
                                onClick={() => setQty(line.deliveryLineId, qty - 1, max)}
                                aria-label="-"
                              >
                                <Minus />
                              </Button>
                              <Input
                                className="h-11 w-20 text-center text-lg tabular-nums"
                                inputMode="decimal"
                                disabled={max <= 0}
                                value={qty === 0 ? '' : String(qty)}
                                placeholder="0"
                                onChange={(e) => setQty(line.deliveryLineId, Number(e.target.value || 0), max)}
                              />
                              <Button
                                type="button"
                                variant="outline"
                                size="icon"
                                className="h-11 w-11"
                                disabled={max <= 0 || qty >= max}
                                onClick={() => setQty(line.deliveryLineId, qty + 1, max)}
                                aria-label="+"
                              >
                                <Plus />
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                className="h-11"
                                disabled={max <= 0 || qty === max}
                                onClick={() => setQty(line.deliveryLineId, max, max)}
                              >
                                {t('pos.return.all')}
                              </Button>
                            </div>
                          </div>
                          {qty > 0 ? (
                            <Input
                              className="h-9"
                              value={reasons[line.deliveryLineId] ?? ''}
                              maxLength={200}
                              onChange={(e) => setReasons((prev) => ({ ...prev, [line.deliveryLineId]: e.target.value }))}
                              placeholder={t('pos.return.reasonPlaceholder')}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>

                  <div className="grid gap-2">
                    <span className="text-sm font-medium">{t('pos.return.refundTitle')}</span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {(
                        [
                          ['cash', 'pos.return.modeCash'],
                          ['same', 'pos.return.modeSame'],
                          ['credit', 'pos.return.modeCredit'],
                        ] as const
                      ).map(([value, key]) => (
                        <Button
                          key={value}
                          type="button"
                          variant={mode === value ? 'default' : 'outline'}
                          className="h-12"
                          disabled={value === 'cash' && !cashAllowed}
                          onClick={() => setMode(value)}
                        >
                          {t(key)}
                        </Button>
                      ))}
                    </div>
                    {mode === 'same' ? (
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <span className="text-sm font-medium">{t('pos.return.method')}</span>
                          <Select value={method} onValueChange={(v) => setMethod(v as RefundMethodDto)}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {NON_CASH_METHODS.map((m) => (
                                <SelectItem key={m} value={m}>
                                  {t(`sales.paymentsReceived.paymentMethodValue.${m}`)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <TreasurySelect value={treasuryId} onChange={setTreasuryId} currency={currency} paymentMethod={method} />
                      </div>
                    ) : null}
                  </div>

                  <Textarea
                    value={notes}
                    maxLength={500}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder={t('pos.notes')}
                    rows={2}
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
                    <div className="grid">
                      <span className="text-sm text-muted-foreground">
                        {mode === 'credit' ? t('pos.return.creditTotal') : t('pos.return.refundTotal')}
                      </span>
                      <Amount value={refundTotal} currency={currency} className="text-2xl font-bold" />
                    </div>
                    <Button
                      size="lg"
                      className="h-14 min-w-48 text-base"
                      disabled={chosen.length === 0 || posReturn.isPending || (mode === 'same' && !treasuryId)}
                      onClick={() => void submit()}
                    >
                      {t('pos.return.submit')}
                    </Button>
                  </div>
                </>
              ) : null}
            </div>
          )}
        </DialogContent>
      </Dialog>
      {approval.dialog}
    </>
  );
}
