import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import { AlertTriangle, ShieldAlert } from 'lucide-react';
import type { PriceViolationDto, SalesLimitsCheckDto } from '@erp-platform/contracts';

import { apiGet } from '../../../lib/api-client';
import { confirmDialog } from '../../../components/feedback/confirm-dialog';

/**
 * The settings hub's sales limits on a draft order / invoice (discount limit, selling below cost or
 * the minimum price, required sales rep). The server enforces them on confirm / post; this explains
 * them up front and asks before going ahead in 'warn' mode.
 */
export function useSalesLimitsCheck(kind: 'sales-orders' | 'sales-invoices', id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: [kind, id, 'limits-check'],
    queryFn: () => apiGet<SalesLimitsCheckDto>(`/${kind}/${id}/limits-check`),
    enabled: Boolean(id) && enabled,
  });
}

function hasIssues(check: SalesLimitsCheckDto | undefined): check is SalesLimitsCheckDto {
  return Boolean(check && (check.repMissing || check.discountExceeded || check.violations.length > 0));
}

/** Before confirming / posting: false = stop (blocked, or the user said no). */
export async function confirmSalesLimits(check: SalesLimitsCheckDto | undefined, t: TFunction): Promise<boolean> {
  if (!hasIssues(check)) return true;
  if (check.blocked) return false;
  if (!check.needsConfirmation) return true;
  return confirmDialog(t('sales.limits.confirmProceed'), { title: t('sales.limits.title'), confirmLabel: t('sales.limits.proceed') });
}

function violationText(t: TFunction, v: PriceViolationDto): string {
  const key = v.kind === 'below_cost' ? (v.floor ? 'belowCost' : 'belowCostNoAmount') : 'belowMin';
  return t(`sales.limits.${key}`, { product: v.productName, price: v.unitNet, floor: v.floor ?? '', currency: v.currency });
}

/** One callout listing every limit the draft breaks, and whether the user can still go ahead. */
export function SalesLimitsCallout({ check }: { check: SalesLimitsCheckDto | undefined }) {
  const { t } = useTranslation();
  if (!hasIssues(check)) return null;
  const blocked = check.blocked;
  const Icon = blocked ? ShieldAlert : AlertTriangle;
  return (
    <div role="alert" className={`flex items-start gap-2 rounded-lg px-3 py-2.5 text-sm ${blocked ? 'bg-danger-soft text-danger' : 'bg-warning-soft text-warning'}`}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="grid gap-0.5">
        {check.repMissing ? <span className="font-medium">{t('sales.limits.repMissing')}</span> : null}
        {check.discountExceeded ? (
          <span className="font-medium">{t('sales.limits.discountExceeded', { discount: check.discountPercent, limit: check.discountLimit })}</span>
        ) : null}
        {check.violations.map((v) => (
          <span key={`${v.lineId}-${v.kind}`} className="font-medium">
            {violationText(t, v)}
          </span>
        ))}
        <span className="text-xs">
          {blocked ? t('sales.limits.blockedHint') : check.canOverride && check.needsConfirmation ? t('sales.limits.overrideHint') : t('sales.limits.warnHint')}
        </span>
      </div>
    </div>
  );
}
