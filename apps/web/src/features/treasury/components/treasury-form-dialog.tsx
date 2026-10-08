import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { TreasuryDto, TreasuryKindDto } from '@erp-platform/contracts';
import {
  Button,
  Checkbox,
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
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useSaveTreasury } from '../api/queries';
import { ChartAccountSelect } from './chart-account-select';
import { decimalToMinorUnits, minorUnitsToDecimalString } from '../../../lib/money';
import { ApiError } from '../../../lib/api-client';

const KINDS: TreasuryKindDto[] = ['cash', 'bank', 'wallet'];

/** Create / edit a treasury. Kind and currency are fixed after creation. */
export function TreasuryFormDialog({
  open,
  onOpenChange,
  treasury,
  defaultCurrency,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  treasury: TreasuryDto | null;
  defaultCurrency: string;
}) {
  const { t } = useTranslation();
  const save = useSaveTreasury();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [kind, setKind] = useState<TreasuryKindDto>('cash');
  const [currency, setCurrency] = useState(defaultCurrency);
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [opening, setOpening] = useState('');
  const [openingDate, setOpeningDate] = useState('');
  const [isDefault, setIsDefault] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [chartOfAccountId, setChartOfAccountId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setCode(treasury?.code ?? '');
    setName(treasury?.name ?? '');
    setKind(treasury?.kind ?? 'cash');
    setCurrency(treasury?.currency ?? defaultCurrency);
    setBankName(treasury?.bankName ?? '');
    setAccountNumber(treasury?.accountNumber ?? '');
    setIban(treasury?.iban ?? '');
    setOpening(treasury ? minorUnitsToDecimalString(treasury.openingBalance.amountMinorUnits) : '');
    setOpeningDate(treasury?.openingBalanceDate ?? `${new Date().getFullYear()}-01-01`);
    setIsDefault(treasury?.isDefault ?? false);
    setIsActive(treasury?.isActive ?? true);
    setChartOfAccountId(treasury?.chartOfAccountId ?? null);
    setNotes(treasury?.notes ?? '');
  }, [open, treasury, defaultCurrency]);

  async function submit() {
    let openingMinor: string;
    try {
      openingMinor = decimalToMinorUnits(opening.trim() === '' ? '0' : opening);
      if (openingMinor.startsWith('-')) throw new Error('negative');
    } catch {
      toast.error(t('treasury.form.invalidAmount'));
      return;
    }
    const common = {
      code: code.trim(),
      name: name.trim(),
      bankName: kind === 'cash' ? null : bankName.trim() || null,
      accountNumber: kind === 'cash' ? null : accountNumber.trim() || null,
      iban: kind === 'bank' ? iban.trim() || null : null,
      chartOfAccountId,
      openingBalanceMinorUnits: openingMinor,
      openingBalanceDate: openingDate || null,
      isDefault,
      notes: notes.trim() || null,
    };
    try {
      await save.mutateAsync(
        treasury ? { id: treasury.id, input: { ...common, isActive } } : { input: { ...common, kind, currency } },
      );
      toast.success(t('treasury.form.saved'));
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{treasury ? t('treasury.form.editTitle') : t('treasury.form.newTitle')}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('treasury.form.code')}</Label>
              <Input dir="ltr" value={code} onChange={(e) => setCode(e.target.value)} placeholder="CASH-02" />
            </div>
            <div className="col-span-2 grid gap-1.5">
              <Label>{t('treasury.form.name')}</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('treasury.form.kind')}</Label>
              <Select value={kind} onValueChange={(value) => setKind(value as TreasuryKindDto)} disabled={Boolean(treasury)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {KINDS.map((k) => (
                    <SelectItem key={k} value={k}>
                      {t(`treasury.kinds.${k}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-1.5">
              <Label>{t('treasury.form.currency')}</Label>
              <Input
                dir="ltr"
                maxLength={3}
                value={currency}
                disabled={Boolean(treasury)}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
              />
            </div>
          </div>
          {kind !== 'cash' ? (
            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label>{kind === 'bank' ? t('treasury.form.bankName') : t('treasury.form.provider')}</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder={kind === 'wallet' ? 'Vodafone Cash / InstaPay' : ''} />
              </div>
              <div className="grid gap-1.5">
                <Label>{kind === 'bank' ? t('treasury.form.accountNumber') : t('treasury.form.walletNumber')}</Label>
                <Input dir="ltr" value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} />
              </div>
              {kind === 'bank' ? (
                <div className="col-span-2 grid gap-1.5">
                  <Label>IBAN</Label>
                  <Input dir="ltr" value={iban} onChange={(e) => setIban(e.target.value)} />
                </div>
              ) : null}
            </div>
          ) : null}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('treasury.form.openingBalance')}</Label>
              <Input inputMode="decimal" dir="ltr" value={opening} onChange={(e) => setOpening(e.target.value)} placeholder="0.00" />
            </div>
            <div className="grid gap-1.5">
              <Label>{t('treasury.form.openingBalanceDate')}</Label>
              <Input type="date" value={openingDate} onChange={(e) => setOpeningDate(e.target.value)} />
            </div>
          </div>
          <ChartAccountSelect value={chartOfAccountId} onChange={setChartOfAccountId} hint={t('treasury.form.chartAccountHint')} />
          <div className="grid gap-1.5">
            <Label>{t('treasury.form.notes')}</Label>
            <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <Checkbox checked={isDefault} onCheckedChange={(checked) => setIsDefault(checked === true)} />
            {t('treasury.form.isDefault')}
          </label>
          {treasury ? (
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={isActive} onCheckedChange={(checked) => setIsActive(checked === true)} />
              {t('common.active')}
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button onClick={submit} disabled={save.isPending || !code.trim() || !name.trim() || !/^[A-Z]{3}$/.test(currency)}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
