import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PosSessionDto } from '@erp-platform/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Input,
  Separator,
  Skeleton,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useClosePosSession, useFinishPosSessionClose, usePosSessionReport } from '../../api/pos/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import { PosCashReconciliation } from './pos-cash-reconciliation';

/**
 * POS Stage 4 — the cashier physically counts the drawer and enters that count;
 * PosSessionsService.close() computes expected_cash_amount/variance_amount
 * server-side. Before the count, the dialog shows the shift's cash movements
 * (sales in cash, refunds, cash in / out, returns) but not the expected total —
 * a blind count. After closing it shows the Z figures (expected, counted,
 * variance); dismissing it returns the till to "open a session".
 */
export function CloseSessionDialog({ session }: { session: PosSessionDto }) {
  const { t } = useTranslation();
  const closeSession = useClosePosSession();
  const finishClose = useFinishPosSessionClose();
  const [open, setOpen] = useState(false);
  const [countedCashAmount, setCountedCashAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [closed, setClosed] = useState(false);
  const { data: report, isLoading } = usePosSessionReport(open ? session.id : undefined);

  function resetAndClose() {
    setOpen(false);
    setCountedCashAmount('');
    setNotes('');
    setError(null);
    if (closed) {
      setClosed(false);
      void finishClose();
    }
  }

  async function onSubmit() {
    setError(null);
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(countedCashAmount);
    } catch {
      setError(t('pos.closeSession.amountError'));
      return;
    }
    try {
      await closeSession.mutateAsync({
        id: session.id,
        input: { countedCashAmount: { amountMinorUnits, currency: session.openingCashAmount.currency }, notes: notes || undefined },
      });
      setClosed(true);
      toast.success(t('pos.closeSession.success'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('pos.closeSession.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : resetAndClose())}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('pos.closeSession.trigger')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('pos.closeSession.title')}</DialogTitle>
        </DialogHeader>
        {isLoading || !report ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <div className="grid gap-2 rounded-lg bg-muted/50 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pos.report.salesCount')}</span>
              <span className="tabular-nums">{report.salesCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t('pos.report.returnsCount')}</span>
              <span className="tabular-nums">{report.returnsCount}</span>
            </div>
            <Separator />
            <PosCashReconciliation report={report} blind={!closed} />
          </div>
        )}
        {closed ? (
          <Button onClick={resetAndClose} className="mt-2">
            {t('common.close')}
          </Button>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {t('pos.closeSession.countedCashAmount')} ({session.openingCashAmount.currency})
              </label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 text-xl tabular-nums"
                value={countedCashAmount}
                onChange={(e) => setCountedCashAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <label className="text-sm font-medium">{t('pos.closeSession.notes')}</label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button onClick={onSubmit} disabled={closeSession.isPending}>
              {t('pos.closeSession.submit')}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
