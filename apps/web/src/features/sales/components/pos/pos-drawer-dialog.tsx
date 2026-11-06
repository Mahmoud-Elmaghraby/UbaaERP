import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PosCashMovementDto, PosSessionDto } from '@erp-platform/contracts';
import {
  Badge,
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
  Tabs,
  TabsList,
  TabsTrigger,
  toast,
} from '@erp-platform/ui';

import { Amount } from '../../../../components/amount';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits } from '../../../../lib/money';
import { usePosCashMovement, usePosDrawerMovements, usePosDrawerOptions } from '../../api/pos/queries';
import { isApprovalCancelled, useSupervisorApproval } from './use-supervisor-approval';

type Kind = PosCashMovementDto['kind'];
const KINDS: Kind[] = ['expense', 'to_treasury', 'from_treasury'];

/**
 * حركة نقدية — cash in / out of this shift's drawer: an expense paid from it,
 * cash taken to the safe / bank, or change brought in. The first two may
 * need a supervisor's PIN (asked only when the API says so). The shift's
 * movements are listed underneath.
 */
export function PosDrawerDialog({
  session,
  open,
  onOpenChange,
}: {
  session: PosSessionDto;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const currency = session.openingCashAmount.currency;
  const { data: options } = usePosDrawerOptions(session.id, open);
  const { data: movements, isLoading } = usePosDrawerMovements(session.id, open);
  const create = usePosCashMovement(session.id);
  const approval = useSupervisorApproval();
  const [kind, setKind] = useState<Kind>('expense');
  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [otherTreasuryId, setOtherTreasuryId] = useState<string | undefined>();
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);

  const otherTreasuries = (options?.treasuries ?? []).filter((tr) => tr.id !== session.treasuryId);

  function reset() {
    setAmount('');
    setDescription('');
    setError(null);
  }

  async function submit() {
    setError(null);
    let amountMinorUnits: string;
    try {
      amountMinorUnits = decimalToMinorUnits(amount);
    } catch {
      setError(t('pos.drawer.amountError'));
      return;
    }
    if (BigInt(amountMinorUnits) <= 0n) {
      setError(t('pos.drawer.amountError'));
      return;
    }
    if (kind === 'expense' && !categoryId) {
      setError(t('pos.drawer.categoryRequired'));
      return;
    }
    if (kind !== 'expense' && !otherTreasuryId) {
      setError(t('pos.drawer.treasuryRequired'));
      return;
    }
    try {
      await approval.run((approvalPin) =>
        create.mutateAsync({
          kind,
          amount: { amountMinorUnits, currency },
          categoryId: kind === 'expense' ? categoryId : null,
          otherTreasuryId: kind === 'expense' ? null : otherTreasuryId,
          description: description.trim() || null,
          approvalPin: approvalPin ?? null,
        }),
      );
      toast.success(t('pos.drawer.success'));
      reset();
    } catch (err) {
      if (isApprovalCancelled(err)) return;
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) reset();
          onOpenChange(next);
        }}
      >
        <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('pos.drawer.title')}</DialogTitle>
            <DialogDescription>{t('pos.drawer.description')}</DialogDescription>
          </DialogHeader>

          <Tabs value={kind} onValueChange={(v) => setKind(v as Kind)}>
            <TabsList className="grid h-auto w-full grid-cols-3">
              {KINDS.map((k) => (
                <TabsTrigger key={k} value={k} className="h-10">
                  {t(`pos.drawer.kinds.${k}`)}
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="grid gap-3">
            {kind === 'expense' ? (
              <div className="grid gap-2">
                <span className="text-sm font-medium">{t('pos.drawer.category')}</span>
                <Select value={categoryId} onValueChange={setCategoryId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={t('pos.drawer.categoryPlaceholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {(options?.categories ?? []).map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="grid gap-2">
                <span className="text-sm font-medium">
                  {kind === 'to_treasury' ? t('pos.drawer.toTreasury') : t('pos.drawer.fromTreasury')}
                </span>
                <Select value={otherTreasuryId} onValueChange={setOtherTreasuryId}>
                  <SelectTrigger className="h-11">
                    <SelectValue placeholder={t('treasury.select.placeholder')} />
                  </SelectTrigger>
                  <SelectContent>
                    {otherTreasuries.map((tr) => (
                      <SelectItem key={tr.id} value={tr.id}>
                        {tr.name} — {t(`treasury.kinds.${tr.kind}`)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('pos.tenders.amount', { currency })}</span>
              <Input
                inputMode="decimal"
                placeholder="0.00"
                className="h-12 text-xl tabular-nums"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <span className="text-sm font-medium">{t('pos.drawer.descriptionLabel')}</span>
              <Input value={description} maxLength={300} onChange={(e) => setDescription(e.target.value)} />
            </div>
            {error ? <p className="text-sm text-destructive">{error}</p> : null}
            <Button className="h-12 text-base" onClick={() => void submit()} disabled={create.isPending}>
              {t(`pos.drawer.submit.${kind}`)}
            </Button>
          </div>

          <div className="grid gap-2 border-t pt-3">
            <span className="text-sm font-medium text-muted-foreground">{t('pos.drawer.shiftMovements')}</span>
            {isLoading ? (
              <Skeleton className="h-20 w-full" />
            ) : !movements || movements.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t('pos.drawer.noMovements')}</p>
            ) : (
              <ul className="grid gap-1.5">
                {movements.map((m) => (
                  <li key={m.id} className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
                    <Badge variant={m.kind === 'from_treasury' ? 'success' : 'warning'}>{t(`pos.drawer.kinds.${m.kind}`)}</Badge>
                    <span className="min-w-0 flex-1 truncate">
                      {m.categoryName ?? m.otherTreasuryName ?? ''}
                      {m.description ? ` · ${m.description}` : ''}
                    </span>
                    {m.status === 'cancelled' ? <Badge variant="danger">{t('pos.drawer.cancelled')}</Badge> : null}
                    <Amount
                      value={m.kind === 'from_treasury' ? m.amount.amountMinorUnits : `-${m.amount.amountMinorUnits}`}
                      currency={m.amount.currency}
                      className={m.status === 'cancelled' ? 'line-through opacity-60' : 'font-semibold'}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {approval.dialog}
    </>
  );
}
