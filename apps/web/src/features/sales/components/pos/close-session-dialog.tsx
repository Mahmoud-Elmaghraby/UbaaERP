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
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useClosePosSession } from '../../api/pos/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, formatMoney } from '../../../../lib/money';

/**
 * POS Stage 4 — the cashier physically counts the drawer and enters that count;
 * PosSessionsService.close() computes expected_cash_amount/variance_amount
 * server-side from opening float + cash tenders recorded during the session (see
 * migration 0059's own comment) and stores both, so this dialog never computes or
 * shows a variance itself before submitting — only after the close call returns.
 */
export function CloseSessionDialog({ session }: { session: PosSessionDto }) {
  const { t } = useTranslation();
  const closeSession = useClosePosSession();
  const [open, setOpen] = useState(false);
  const [countedCashAmount, setCountedCashAmount] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PosSessionDto | null>(null);

  function resetAndClose() {
    setOpen(false);
    setCountedCashAmount('');
    setNotes('');
    setError(null);
    setResult(null);
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
      const closed = await closeSession.mutateAsync({
        id: session.id,
        input: { countedCashAmount: { amountMinorUnits, currency: session.openingCashAmount.currency }, notes: notes || undefined },
      });
      setResult(closed);
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('pos.closeSession.title')}</DialogTitle>
        </DialogHeader>
        {result ? (
          <div className="grid gap-3 text-sm">
            <div>
              <p className="text-muted-foreground">{t('pos.closeSession.expectedCashAmount')}</p>
              <p className="font-medium">
                {result.expectedCashAmount
                  ? formatMoney(result.expectedCashAmount.amountMinorUnits, result.expectedCashAmount.currency)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('pos.closeSession.countedCashAmount')}</p>
              <p className="font-medium">
                {result.countedCashAmount
                  ? formatMoney(result.countedCashAmount.amountMinorUnits, result.countedCashAmount.currency)
                  : '—'}
              </p>
            </div>
            <div>
              <p className="text-muted-foreground">{t('pos.closeSession.varianceAmount')}</p>
              <p className="font-medium">
                {result.varianceAmount
                  ? formatMoney(result.varianceAmount.amountMinorUnits, result.varianceAmount.currency)
                  : '—'}
              </p>
            </div>
            <Button onClick={resetAndClose} className="mt-2">
              {t('common.close')}
            </Button>
          </div>
        ) : (
          <div className="grid gap-4">
            <div className="grid gap-2">
              <label className="text-sm font-medium">
                {t('pos.closeSession.countedCashAmount')} ({session.openingCashAmount.currency})
              </label>
              <Input
                inputMode="decimal"
                placeholder="0.00"
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
