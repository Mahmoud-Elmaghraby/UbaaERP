import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input, toast, useHasPermission } from '@erp-platform/ui';

import { useTenantSettings, useUpdateTenantSettings } from './queries';
import { ApiError } from '../../lib/api-client';

/**
 * Settings › Sales: the biggest discount (% of the sale) a cashier may give
 * at the till without a supervisor's PIN (tenant_settings.pos_max_discount_percent,
 * migration 0113). Empty = no limit.
 */
export function PosDiscountLimitField() {
  const { t } = useTranslation();
  const { data: settings } = useTenantSettings();
  const update = useUpdateTenantSettings();
  const canManage = useHasPermission('settings.manage');
  const saved = settings?.posMaxDiscountPercent ?? null;
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(saved === null ? '' : String(saved));
  }, [saved]);

  const trimmed = value.trim();
  const parsed = trimmed === '' ? null : Number(trimmed);
  const invalid = parsed !== null && (!Number.isFinite(parsed) || parsed < 0 || parsed > 100);
  const dirty = parsed !== saved;

  async function save() {
    if (invalid) return;
    try {
      await update.mutateAsync({ posMaxDiscountPercent: parsed });
      toast.success(t('settings.sales.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <div className="grid max-w-md gap-1.5">
      <label className="text-sm font-medium" htmlFor="pos-max-discount">
        {t('settings.sales.posMaxDiscountPercent')}
      </label>
      <div className="flex gap-2">
        <Input
          id="pos-max-discount"
          type="number"
          min={0}
          max={100}
          step="any"
          inputMode="decimal"
          className="w-32"
          placeholder={t('settings.sales.noLimit')}
          value={value}
          disabled={!canManage || update.isPending}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              void save();
            }
          }}
        />
        {canManage && dirty ? (
          <Button variant="outline" onClick={() => void save()} disabled={invalid || update.isPending}>
            {t('common.save')}
          </Button>
        ) : null}
      </div>
      <p className={invalid ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
        {invalid ? t('settings.sales.posMaxDiscountInvalid') : t('settings.sales.posMaxDiscountHint')}
      </p>
    </div>
  );
}
