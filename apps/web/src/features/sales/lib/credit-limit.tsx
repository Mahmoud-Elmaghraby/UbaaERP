import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle } from 'lucide-react';
import type { CustomerCreditCheckDto } from '@erp-platform/contracts';

import { confirmDialog } from '../../../components/feedback/confirm-dialog';
import { formatMoney } from '../../../lib/money';

/**
 * Customer credit limit on the sales screens (migration 0109). The server
 * enforces the rule on confirm / post; these only explain it up front.
 */

/** 'block' mode, above the limit, and the user may not override → the action is disabled. */
export function isCreditBlocked(check: CustomerCreditCheckDto | undefined): boolean {
  return Boolean(check?.exceeded && check.mode === 'block' && !check.canOverride);
}

/**
 * Before confirming / posting: above the limit ('warn', or 'block' with the
 * override permission) asks first; otherwise goes ahead.
 */
export async function confirmCreditLimit(check: CustomerCreditCheckDto | undefined, t: TFunction): Promise<boolean> {
  if (!check?.exceeded) return true;
  if (isCreditBlocked(check)) return false;
  return confirmDialog(t('sales.creditLimit.confirmProceed', creditParams(check)), {
    title: t('sales.creditLimit.title'),
    confirmLabel: t('sales.creditLimit.proceed'),
  });
}

function creditParams(check: CustomerCreditCheckDto) {
  return {
    limit: formatMoney(check.limitMinorUnits ?? '0', check.currency),
    exposure: formatMoney(check.exposureMinorUnits, check.currency),
    balance: formatMoney(check.balanceMinorUnits, check.currency),
  };
}

/** Amber callout shown when the document would take the customer above the credit limit. */
export function CreditLimitCallout({ check }: { check: CustomerCreditCheckDto | undefined }) {
  const { t } = useTranslation();
  if (!check?.exceeded) return null;
  const blocked = isCreditBlocked(check);
  return (
    <div role="alert" className="flex items-start gap-2 rounded-lg bg-warning-soft px-3 py-2.5 text-sm text-warning">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="grid gap-0.5">
        <span className="font-medium">{t('sales.creditLimit.exceeded', creditParams(check))}</span>
        <span className="text-xs">
          {blocked
            ? t('sales.creditLimit.blockedHint')
            : check.mode === 'block'
              ? t('sales.creditLimit.overrideHint')
              : t('sales.creditLimit.warnHint')}
        </span>
      </div>
    </div>
  );
}
