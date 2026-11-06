import { useTranslation } from 'react-i18next';
import type { CreditLimitMode } from '@erp-platform/contracts';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
  useHasPermission,
} from '@erp-platform/ui';

import { useTenantSettings, useUpdateTenantSettings } from './queries';
import { ApiError } from '../../lib/api-client';
import { PosDiscountLimitField } from './pos-discount-limit-field';

const MODES: CreditLimitMode[] = ['off', 'warn', 'block'];

/**
 * Settings › Sales: what happens when a confirmed sales order / posted sales
 * invoice takes a customer above their credit limit (tenant_settings.credit_limit_mode,
 * migration 0109). The limit itself is set per customer.
 */
export function SalesSettingsSection() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useTenantSettings();
  const update = useUpdateTenantSettings();
  const canManage = useHasPermission('settings.manage');

  async function change(mode: CreditLimitMode) {
    try {
      await update.mutateAsync({ creditLimitMode: mode });
      toast.success(t('settings.sales.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.sales.title')}</CardTitle>
        <CardDescription>{t('settings.sales.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !settings ? (
          <Skeleton className="h-16 w-full" />
        ) : (
          <div className="grid max-w-md gap-1.5">
            <label className="text-sm font-medium" htmlFor="credit-limit-mode">
              {t('settings.sales.creditLimitMode')}
            </label>
            <Select
              value={settings.creditLimitMode}
              disabled={!canManage || update.isPending}
              onValueChange={(value) => void change(value as CreditLimitMode)}
            >
              <SelectTrigger id="credit-limit-mode">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {MODES.map((mode) => (
                  <SelectItem key={mode} value={mode}>
                    {t(`settings.sales.creditLimitModes.${mode}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{t(`settings.sales.creditLimitModeHints.${settings.creditLimitMode}`)}</p>
          </div>
        )}
        <div className="mt-6">
          <PosDiscountLimitField />
        </div>
      </CardContent>
    </Card>
  );
}
