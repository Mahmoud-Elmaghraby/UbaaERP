import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeftRight, Ban, MinusCircle, PlusCircle, Printer } from 'lucide-react';
import type { TreasuryVoucherDto, TreasuryVoucherKindDto } from '@erp-platform/contracts';
import {
  Badge,
  Button,
  Can,
  Card,
  CardContent,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  PageHeader,
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

import {
  useCancelTreasuryVoucher,
  useCreateTreasuryVoucher,
  useTreasuryCategories,
  useTreasuryLookup,
  useTreasuryVouchers,
} from '../api/queries';
import { decimalToMinorUnits, formatAmount } from '../../../lib/money';
import { ApiError } from '../../../lib/api-client';
import { openPrint } from '../../../components/printing/print-button';

const KIND_ICONS = { expense: MinusCircle, income: PlusCircle, transfer: ArrowLeftRight } as const;
const ALL = '__all__';

function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** سندات الخزينة — expenses, other income and transfers; record, print, cancel. */
export function TreasuryVouchersPage() {
  const { t } = useTranslation();
  const [kind, setKind] = useState<TreasuryVoucherKindDto | undefined>(undefined);
  const [treasuryId, setTreasuryId] = useState<string | undefined>(undefined);
  const { data: vouchers, isLoading } = useTreasuryVouchers({ kind, treasuryId });
  const { data: treasuries } = useTreasuryLookup();
  const [creating, setCreating] = useState<TreasuryVoucherKindDto | null>(null);
  const [cancelling, setCancelling] = useState<TreasuryVoucherDto | null>(null);

  return (
    <div className="grid gap-6">
      <PageHeader
        title={t('treasury.vouchers.title')}
        description={t('treasury.vouchers.subtitle')}
        actions={
          <Can permission="treasury.vouchers.manage">
            {(['expense', 'income', 'transfer'] as const).map((k) => {
              const Icon = KIND_ICONS[k];
              return (
                <Button key={k} variant={k === 'expense' ? 'default' : 'outline'} onClick={() => setCreating(k)}>
                  <Icon />
                  {t(`treasury.vouchers.new.${k}`)}
                </Button>
              );
            })}
          </Can>
        }
      />

      <div className="flex flex-wrap items-end gap-3">
        <div className="grid gap-1.5">
          <Label>{t('treasury.vouchers.kind')}</Label>
          <Select value={kind ?? ALL} onValueChange={(v) => setKind(v === ALL ? undefined : (v as TreasuryVoucherKindDto))}>
            <SelectTrigger className="w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('treasury.vouchers.allKinds')}</SelectItem>
              {(['expense', 'income', 'transfer'] as const).map((k) => (
                <SelectItem key={k} value={k}>
                  {t(`treasury.vouchers.kinds.${k}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>{t('treasury.select.label')}</Label>
          <Select value={treasuryId ?? ALL} onValueChange={(v) => setTreasuryId(v === ALL ? undefined : v)}>
            <SelectTrigger className="w-56">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('treasury.allTreasuries')}</SelectItem>
              {(treasuries ?? []).map((x) => (
                <SelectItem key={x.id} value={x.id}>
                  {x.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? <Skeleton className="h-48 w-full" /> : null}

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('treasury.vouchers.number')}</TableHead>
                <TableHead>{t('statements.columns.date')}</TableHead>
                <TableHead>{t('treasury.vouchers.kind')}</TableHead>
                <TableHead>{t('treasury.select.label')}</TableHead>
                <TableHead>{t('treasury.vouchers.itemOrTarget')}</TableHead>
                <TableHead>{t('treasury.vouchers.counterparty')}</TableHead>
                <TableHead className="text-end">{t('treasury.vouchers.amount')}</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(vouchers ?? []).length === 0 && !isLoading ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    {t('treasury.vouchers.empty')}
                  </TableCell>
                </TableRow>
              ) : null}
              {(vouchers ?? []).map((v) => (
                <TableRow key={v.id} className={v.status === 'cancelled' ? 'text-muted-foreground line-through' : ''}>
                  <TableCell dir="ltr" className="text-start font-medium">{v.voucherNumber}</TableCell>
                  <TableCell dir="ltr" className="tabular-nums">{v.voucherDate}</TableCell>
                  <TableCell>
                    <Badge variant={v.kind === 'expense' ? 'danger' : v.kind === 'income' ? 'success' : 'info'}>
                      {t(`treasury.vouchers.kinds.${v.kind}`)}
                    </Badge>
                    {v.status === 'cancelled' ? <Badge variant="neutral" className="ms-1">{t('treasury.vouchers.cancelled')}</Badge> : null}
                  </TableCell>
                  <TableCell>{v.treasuryName}</TableCell>
                  <TableCell>{v.kind === 'transfer' ? `← ${v.toTreasuryName ?? ''}` : v.categoryName}</TableCell>
                  <TableCell>
                    {v.counterparty ?? ''}
                    {v.description ? <span className="block text-xs text-muted-foreground">{v.description}</span> : null}
                  </TableCell>
                  <TableCell className="text-end font-semibold tabular-nums" dir="ltr">
                    {formatAmount(v.amount.amountMinorUnits)} <span className="text-xs text-muted-foreground">{v.amount.currency}</span>
                  </TableCell>
                  <TableCell className="whitespace-nowrap text-end">
                    <Button variant="ghost" size="icon" title={t('printing.print')} onClick={() => openPrint('treasury_voucher', v.id)}>
                      <Printer className="h-4 w-4" />
                    </Button>
                    {v.status === 'posted' ? (
                      <Can permission="treasury.vouchers.manage">
                        <Button variant="ghost" size="icon" title={t('treasury.vouchers.cancel')} onClick={() => setCancelling(v)}>
                          <Ban className="h-4 w-4" />
                        </Button>
                      </Can>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      <VoucherDialog kind={creating} onClose={() => setCreating(null)} />
      <CancelDialog voucher={cancelling} onClose={() => setCancelling(null)} />
    </div>
  );
}

function VoucherDialog({ kind, onClose }: { kind: TreasuryVoucherKindDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: treasuries } = useTreasuryLookup();
  const { data: categories } = useTreasuryCategories(kind === 'expense' || kind === 'income' ? kind : undefined);
  const create = useCreateTreasuryVoucher();
  const [date, setDate] = useState(today());
  const [treasuryId, setTreasuryId] = useState('');
  const [toTreasuryId, setToTreasuryId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [amount, setAmount] = useState('');
  const [counterparty, setCounterparty] = useState('');
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (!kind) return;
    setDate(today());
    setTreasuryId((treasuries ?? []).find((x) => x.kind === 'cash' && x.isDefault)?.id ?? treasuries?.[0]?.id ?? '');
    setToTreasuryId('');
    setCategoryId('');
    setAmount('');
    setCounterparty('');
    setDescription('');
    setReference('');
  }, [kind, treasuries]);

  const source = (treasuries ?? []).find((x) => x.id === treasuryId);
  const targets = useMemo(
    () => (treasuries ?? []).filter((x) => x.id !== treasuryId && x.currency === source?.currency),
    [treasuries, treasuryId, source],
  );
  const activeCategories = (categories ?? []).filter((c) => c.isActive && c.kind === kind);

  async function submit(printAfter: boolean) {
    if (!kind) return;
    let minor: string;
    try {
      minor = decimalToMinorUnits(amount);
      if (!/^[1-9]\d*$/.test(minor)) throw new Error('not positive');
    } catch {
      toast.error(t('treasury.form.invalidAmount'));
      return;
    }
    try {
      const voucher = await create.mutateAsync({
        kind,
        voucherDate: date,
        treasuryId,
        toTreasuryId: kind === 'transfer' ? toTreasuryId : null,
        categoryId: kind === 'transfer' ? null : categoryId,
        amountMinorUnits: minor,
        counterparty: counterparty.trim() || null,
        description: description.trim() || null,
        reference: reference.trim() || null,
      });
      toast.success(t('treasury.vouchers.saved', { number: voucher.voucherNumber }));
      if (printAfter) openPrint('treasury_voucher', voucher.id);
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  const ready = Boolean(treasuryId && date && amount && (kind === 'transfer' ? toTreasuryId : categoryId));

  return (
    <Dialog open={kind !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{kind ? t(`treasury.vouchers.new.${kind}`) : ''}</DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-1.5">
              <Label>{t('statements.columns.date')}</Label>
              <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="grid gap-1.5">
              <Label>
                {t('treasury.vouchers.amount')} {source ? `(${source.currency})` : ''}
              </Label>
              <Input inputMode="decimal" dir="ltr" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="0.00" autoFocus />
            </div>
          </div>
          <div className="grid gap-1.5">
            <Label>{kind === 'income' ? t('treasury.vouchers.into') : t('treasury.vouchers.from')}</Label>
            <Select value={treasuryId} onValueChange={setTreasuryId}>
              <SelectTrigger>
                <SelectValue placeholder={t('treasury.select.placeholder')} />
              </SelectTrigger>
              <SelectContent>
                {(treasuries ?? []).map((x) => (
                  <SelectItem key={x.id} value={x.id}>
                    {x.name} — {t(`treasury.kinds.${x.kind}`)} ({x.currency})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {kind === 'transfer' ? (
            <div className="grid gap-1.5">
              <Label>{t('treasury.vouchers.to')}</Label>
              <Select value={toTreasuryId} onValueChange={setToTreasuryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('treasury.select.placeholder')} />
                </SelectTrigger>
                <SelectContent>
                  {targets.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.name} — {t(`treasury.kinds.${x.kind}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : (
            <div className="grid gap-1.5">
              <Label>{t('treasury.vouchers.item')}</Label>
              <Select value={categoryId} onValueChange={setCategoryId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('treasury.vouchers.chooseItem')} />
                </SelectTrigger>
                <SelectContent>
                  {activeCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id}>
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          {kind !== 'transfer' ? (
            <div className="grid gap-1.5">
              <Label>{kind === 'expense' ? t('treasury.vouchers.paidTo') : t('treasury.vouchers.receivedFrom')}</Label>
              <Input value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </div>
          ) : null}
          <div className="grid gap-1.5">
            <Label>{t('treasury.notes')}</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="grid gap-1.5">
            <Label>{t('treasury.vouchers.reference')}</Label>
            <Input value={reference} onChange={(e) => setReference(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="secondary" onClick={() => submit(true)} disabled={!ready || create.isPending}>
              <Printer />
              {t('treasury.vouchers.saveAndPrint')}
            </Button>
            <Button onClick={() => submit(false)} disabled={!ready || create.isPending}>
              {t('common.save')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CancelDialog({ voucher, onClose }: { voucher: TreasuryVoucherDto | null; onClose: () => void }) {
  const { t } = useTranslation();
  const cancel = useCancelTreasuryVoucher();
  const [reason, setReason] = useState('');
  useEffect(() => setReason(''), [voucher]);

  async function submit() {
    if (!voucher) return;
    try {
      await cancel.mutateAsync({ id: voucher.id, input: { reason: reason.trim() } });
      toast.success(t('treasury.vouchers.cancelledToast'));
      onClose();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Dialog open={voucher !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {t('treasury.vouchers.cancel')} {voucher?.voucherNumber}
          </DialogTitle>
        </DialogHeader>
        <div className="grid gap-4">
          <p className="text-sm text-muted-foreground">{t('treasury.vouchers.cancelHint')}</p>
          <div className="grid gap-1.5">
            <Label>{t('treasury.vouchers.cancelReason')}</Label>
            <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>
              {t('common.cancel')}
            </Button>
            <Button variant="destructive" onClick={submit} disabled={!reason.trim() || cancel.isPending}>
              {t('treasury.vouchers.confirmCancel')}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
