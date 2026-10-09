import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PartyKindDto } from '@erp-platform/contracts';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  toast,
} from '@erp-platform/ui';

import { useOpeningBalance, useSetOpeningBalance } from './queries';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../lib/money';
import { ApiError } from '../../lib/api-client';
import { CurrencySelect } from '../../components/document/currency-select';

/**
 * رصيد أول المدة: amount + which way it goes (عليه / له) + date. Saving
 * replaces the previous value; with Accounting on, only the difference is
 * posted against the opening-balance account.
 */
export function OpeningBalanceDialog({
  kind,
  partyId,
  defaultCurrency,
  open,
  onOpenChange,
}: {
  kind: PartyKindDto;
  partyId: string;
  defaultCurrency: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const { data: current } = useOpeningBalance(kind, open ? partyId : undefined);
  const save = useSetOpeningBalance(kind, partyId);
  const [amount, setAmount] = useState('');
  const [side, setSide] = useState<'owes_us' | 'we_owe'>(kind === 'customer' ? 'owes_us' : 'we_owe');
  const [date, setDate] = useState('');
  const [currency, setCurrency] = useState(defaultCurrency);

  useEffect(() => {
    if (!open) return;
    setAmount(current?.amount ? minorUnitsToDecimalString(current.amount.amountMinorUnits) : '');
    if (current?.side) setSide(current.side);
    setDate(current?.date ?? `${new Date().getFullYear()}-01-01`);
    setCurrency(current?.amount?.currency ?? defaultCurrency);
  }, [open, current, defaultCurrency]);

  async function submit() {
    let minor: string;
    try {
      minor = decimalToMinorUnits(amount.trim() === '' ? '0' : amount.trim());
    } catch {
      toast.error(t('statements.opening.invalidAmount'));
      return;
    }
    if (minor.startsWith('-')) {
      toast.error(t('statements.opening.invalidAmount'));
      return;
    }
    try {
      await save.mutateAsync({ amount: { amountMinorUnits: minor, currency }, side, date });
      toast.success(t('statements.opening.saved'));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('statements.opening.title')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t(`statements.opening.hint.${kind}`)}</p>
          <div className="grid gap-1.5">
            <Label>{t('statements.opening.amount')}</Label>
            <div className="flex gap-2">
              <Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" />
              <CurrencySelect className="w-40" value={currency} onChange={setCurrency} />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('statements.opening.side')}</Label>
            <Select value={side} onValueChange={(value) => setSide(value as 'owes_us' | 'we_owe')}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="owes_us">{t(`statements.opening.sides.${kind}.owes_us`)}</SelectItem>
                <SelectItem value="we_owe">{t(`statements.opening.sides.${kind}.we_owe`)}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>{t('statements.opening.date')}</Label>
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={save.isPending || !date || !/^[A-Z]{3}$/.test(currency)}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
