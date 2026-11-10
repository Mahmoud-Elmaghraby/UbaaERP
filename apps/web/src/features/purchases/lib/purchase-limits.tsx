import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { PurchaseLimitsCheckDto } from '@erp-platform/contracts';

import { apiGet } from '../../../lib/api-client';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';

/**
 * The settings hub's purchases limits on a draft order / invoice (approval amount, price above
 * the last purchase price, required supplier number). The server enforces them on confirm / post;
 * this explains them up front and asks before going ahead when only a warning applies.
 */
export function usePurchaseLimitsCheck(kind: 'purchase-orders' | 'purchase-invoices', id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [kind, id, 'limits-check'],
    queryFn: () => apiGet<PurchaseLimitsCheckDto>(`/${kind}/${id}/limits-check`),
    enabled: Boolean(id) && enabled,
  });
}

function hasIssues(check: PurchaseLimitsCheckDto | undefined): check is PurchaseLimitsCheckDto {
  return Boolean(check && (check.approvalRequired || check.priceIncreases.length > 0 || check.supplierInvoiceNumberMissing));
}

/** Before confirming / posting: false = stop (blocked, or the user said no). */
export async function confirmPurchaseLimits(check: PurchaseLimitsCheckDto | undefined, t: TFunction): Promise<boolean> {
  if (!hasIssues(check)) return true;
  if (check.blocked) return false;
  if (!check.needsConfirmation) return true;
  return confirmDialog(t('purchases.limits.confirmProceed'), { title: t('purchases.limits.title'), confirmLabel: t('purchases.limits.proceed') });
}

/** One callout listing every purchases limit the draft meets, and whether this user can go ahead. */
export function PurchaseLimitsCallout({ check }: { check: PurchaseLimitsCheckDto | undefined }) {
  const { t } = useTranslation();
  if (!hasIssues(check)) return null;
  const blocked = check.blocked;
  const Icon = blocked ? ShieldAlert : AlertTriangle;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${blocked ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="grid gap-0.5">
        {check.supplierInvoiceNumberMissing ? <span className="font-medium">{t('purchases.limits.supplierNumberMissing')}</span> : null}
        {check.approvalRequired ? (
          <span className="font-medium">
            {t(check.canApprove ? 'purchases.limits.approvalYou' : 'purchases.limits.approvalNeeded', {
              amount: check.approvalAmount,
              currency: check.companyCurrency,
            })}
          </span>
        ) : null}
        {check.priceIncreases.map((p) => (
          <span key={p.lineId} className="font-medium">
            {t('purchases.limits.priceAboveLast', {
              product: p.productName,
              price: p.unitPrice,
              last: p.lastPrice,
              currency: p.currency,
              percent: p.increasePercent,
              document: p.lastDocument,
            })}
          </span>
        ))}
        <span className="text-xs">
          {blocked
            ? check.supplierInvoiceNumberMissing
              ? t('purchases.limits.fixNumberHint')
              : t('purchases.limits.blockedHint')
            : check.canApprove && (check.approvalRequired || check.priceIncreaseMode === 'block')
              ? t('purchases.limits.approverHint')
              : t('purchases.limits.warnHint')}
        </span>
      </div>
    </div>
  );
}
