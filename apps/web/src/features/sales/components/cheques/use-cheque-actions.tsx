import { useCallback, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { toast } from '@erp-platform/ui';

import { useBounceCheque, useClearIssuedCheque, useCollectCheque } from '../../api/cheques/queries';
import { ApiError } from '../../../../lib/api-client';
import { ChequeActionDialog } from '../../../../components/document/cheque-fields';

export type ChequeActionKind = 'collect' | 'bounce' | 'clear';

export interface ChequeActionTarget {
  /** The receipt id (collect / bounce) or the supplier payment id (clear). */
  id: string;
  currency: string;
  chequeNumber: string | null;
}

/**
 * Collect / bounce (customer cheques) and clear (our cheques) — one dialog
 * asking for the date (and the bank, for collecting). Render `dialog` once.
 */
export function useChequeActions() {
  const { t } = useTranslation();
  const collect = useCollectCheque();
  const bounce = useBounceCheque();
  const clear = useClearIssuedCheque();
  const [pending, setPending] = useState<{ kind: ChequeActionKind; target: ChequeActionTarget } | null>(null);

  async function confirm({ date, treasuryId }: { date: string; treasuryId: string | null }): Promise<boolean> {
    if (!pending) return false;
    const { kind, target } = pending;
    try {
      if (kind === 'collect') await collect.mutateAsync({ id: target.id, input: { treasuryId: treasuryId!, date } });
      else if (kind === 'bounce') await bounce.mutateAsync({ id: target.id, input: { date } });
      else await clear.mutateAsync({ id: target.id, input: { date } });
      toast.success(t(`cheques.${kind}Success`));
      return true;
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
      return false;
    }
  }

  const kind = pending?.kind;
  const number = pending?.target.chequeNumber ?? '';
  const dialog: ReactNode = (
    <ChequeActionDialog
      open={pending !== null}
      onOpenChange={(open) => !open && setPending(null)}
      title={kind ? t(`cheques.${kind}Title`, { number }) : ''}
      description={kind ? t(`cheques.${kind}Hint`) : undefined}
      confirmLabel={kind ? t(`cheques.actions.${kind}`) : ''}
      tone={kind === 'bounce' ? 'danger' : 'default'}
      treasuryCurrency={kind === 'collect' ? pending?.target.currency : undefined}
      busy={collect.isPending || bounce.isPending || clear.isPending}
      onConfirm={confirm}
    />
  );

  const open = useCallback(
    (actionKind: ChequeActionKind, target: ChequeActionTarget) => setPending({ kind: actionKind, target }),
    [],
  );
  return { open, dialog };
}
