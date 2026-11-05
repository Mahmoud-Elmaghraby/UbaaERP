import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  cn,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Label,
  type BadgeProps,
} from '@erp-platform/ui';

import { todayIso } from '../../lib/format-date';
import { TreasurySelect } from './treasury-select';

/** What the user types for a cheque: its number, the drawee bank and the due date. */
export interface ChequeDraft {
  number: string;
  bank: string;
  dueDate: string;
}

export const EMPTY_CHEQUE_DRAFT: ChequeDraft = { number: '', bank: '', dueDate: '' };

export type ChequeDraftErrors = Partial<Record<keyof ChequeDraft, string>>;

/** Number and due date are required; returns the payload for the API, or the error keys. */
export function prepareCheque(
  draft: ChequeDraft,
): { cheque: { number: string; bank: string | null; dueDate: string } } | { errors: ChequeDraftErrors } {
  const errors: ChequeDraftErrors = {};
  if (!draft.number.trim()) errors.number = 'cheques.numberRequired';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(draft.dueDate)) errors.dueDate = 'cheques.dueDateRequired';
  if (Object.keys(errors).length > 0) return { errors };
  return { cheque: { number: draft.number.trim(), bank: draft.bank.trim() || null, dueDate: draft.dueDate } };
}

/** Cheque number / bank / due date inputs (a fragment: they sit in the caller's grid). */
export function ChequeFields({
  value,
  onChange,
  errors,
}: {
  value: ChequeDraft;
  onChange: (next: ChequeDraft) => void;
  errors?: ChequeDraftErrors;
}) {
  const { t } = useTranslation();
  const field = (key: keyof ChequeDraft, label: string, input: ReactNode) => (
    <div className="grid gap-2">
      <Label htmlFor={`cheque-${key}`}>{label}</Label>
      {input}
      {errors?.[key] ? <p className="text-sm text-destructive">{t(errors[key]!)}</p> : null}
    </div>
  );
  return (
    <>
      {field(
        'number',
        `${t('cheques.number')} *`,
        <Input
          id="cheque-number"
          dir="ltr"
          value={value.number}
          onChange={(event) => onChange({ ...value, number: event.target.value })}
        />,
      )}
      {field(
        'bank',
        t('cheques.bank'),
        <Input id="cheque-bank" value={value.bank} onChange={(event) => onChange({ ...value, bank: event.target.value })} />,
      )}
      {field(
        'dueDate',
        `${t('cheques.dueDate')} *`,
        <Input
          id="cheque-dueDate"
          type="date"
          value={value.dueDate}
          onChange={(event) => onChange({ ...value, dueDate: event.target.value })}
        />,
      )}
    </>
  );
}

export type ChequeStatus = 'in_hand' | 'collected' | 'bounced' | 'endorsed' | 'issued' | 'cleared';

export const CHEQUE_STATUS_VARIANT: Record<ChequeStatus, NonNullable<BadgeProps['variant']>> = {
  in_hand: 'info',
  collected: 'success',
  bounced: 'danger',
  endorsed: 'neutral',
  issued: 'warning',
  cleared: 'success',
};

export function ChequeStatusBadge({ status }: { status: ChequeStatus | null | undefined }) {
  const { t } = useTranslation();
  if (!status) return null;
  return (
    <Badge variant={CHEQUE_STATUS_VARIANT[status]} dot>
      {t(`cheques.status.${status}`)}
    </Badge>
  );
}

/** 'overdue' (due date passed), 'soon' (due within `days` days, today included) or null. Dates are 'YYYY-MM-DD'. */
export function chequeDueState(dueDate: string | null | undefined, today: string = todayIso(), days = 7): 'overdue' | 'soon' | null {
  if (!dueDate) return null;
  const due = dueDate.slice(0, 10);
  if (due < today) return 'overdue';
  const limit = new Date(`${today}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + days);
  return due <= limit.toISOString().slice(0, 10) ? 'soon' : null;
}

/** A due date coloured by how close it is (overdue red, due this week amber). */
export function ChequeDueDate({ dueDate, formatted, active }: { dueDate: string | null; formatted: string; active: boolean }) {
  const { t } = useTranslation();
  const state = active ? chequeDueState(dueDate) : null;
  return (
    <span className={cn('inline-flex items-center gap-1.5 tabular-nums', state === 'overdue' && 'font-semibold text-danger', state === 'soon' && 'font-semibold text-warning')}>
      {formatted}
      {state ? <span className="text-xs font-normal">({t(`cheques.due.${state}`)})</span> : null}
    </span>
  );
}

/**
 * The dialog behind every cheque action (collect / bounce / clear): an action
 * date, plus — for collecting — the bank treasury the money lands in.
 * `onConfirm` resolves true when done (the dialog closes).
 */
export function ChequeActionDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  tone = 'default',
  treasuryCurrency,
  busy,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  confirmLabel: string;
  tone?: 'default' | 'danger';
  /** Set to ask for the bank treasury (collect): only treasuries in this currency are offered. */
  treasuryCurrency?: string;
  busy?: boolean;
  onConfirm: (input: { date: string; treasuryId: string | null }) => Promise<boolean>;
}) {
  const { t } = useTranslation();
  const [date, setDate] = useState(todayIso());
  const [treasuryId, setTreasuryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDate(todayIso());
      setError(null);
    }
  }, [open]);

  async function submit() {
    if (treasuryCurrency && !treasuryId) {
      setError(t('cheques.treasuryRequired'));
      return;
    }
    if (await onConfirm({ date, treasuryId })) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <div className="grid gap-4">
          {treasuryCurrency ? (
            <TreasurySelect
              value={treasuryId}
              onChange={setTreasuryId}
              currency={treasuryCurrency}
              paymentMethod="bank_transfer"
              label={t('cheques.collectInto')}
            />
          ) : null}
          <div className="grid gap-2">
            <Label htmlFor="cheque-action-date">{t('cheques.actionDate')}</Label>
            <Input id="cheque-action-date" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </div>
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            type="button"
            variant={tone === 'danger' ? 'destructive' : 'default'}
            disabled={busy || !date}
            onClick={() => void submit()}
          >
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
