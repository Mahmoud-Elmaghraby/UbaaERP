import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { InventorySettingsDto } from '@erp-platform/contracts';
import {
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
  toast,
} from '@erp-platform/ui';

import { useInventorySettings, useUpdateInventorySettings } from '../inventory/api/catalog/queries';
import { ApiError } from '../../lib/api-client';
import { UnitOfMeasureField } from '../inventory/components/products/product-form-fields';

/**
 * Settings › Modules › Inventory: how item codes and barcodes are produced.
 * "Auto" item codes use the 'product' numbering sequence (prefix and padding
 * are editable in the Numbering tab, created on first use as ITM-00001).
 */
export function InventorySettingsSection() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useInventorySettings();
  const update = useUpdateInventorySettings();
  const [draft, setDraft] = useState<Omit<InventorySettingsDto, 'updatedAt'> | null>(null);

  useEffect(() => {
    if (settings) {
      setDraft({
        itemCodeMode: settings.itemCodeMode,
        barcodeMode: settings.barcodeMode,
        barcodePrefix: settings.barcodePrefix,
        scaleBarcodeEnabled: settings.scaleBarcodeEnabled,
        scaleBarcodePrefix: settings.scaleBarcodePrefix,
        scaleItemCodeLength: settings.scaleItemCodeLength,
        scaleValueType: settings.scaleValueType,
        scaleValueDecimals: settings.scaleValueDecimals,
        defaultUnitOfMeasureId: settings.defaultUnitOfMeasureId,
      });
    }
  }, [settings]);

  const prefixValid = draft ? /^[0-9]{1,7}$/.test(draft.barcodePrefix) : true;
  // EAN-13 = prefix + item code + value + check digit; the value needs ≥ 3 digits.
  const scaleValid = draft
    ? /^[0-9]{1,3}$/.test(draft.scaleBarcodePrefix) && 12 - draft.scaleBarcodePrefix.length - draft.scaleItemCodeLength >= 3
    : true;

  async function save() {
    if (!draft || !prefixValid || !scaleValid) return;
    try {
      await update.mutateAsync(draft);
      toast.success(t('settings.inventory.saved'));
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('common.error'));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('settings.inventory.title')}</CardTitle>
        <CardDescription>{t('settings.inventory.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        {isLoading || !draft ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <div className="grid gap-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">{t('settings.inventory.itemCodeMode')}</label>
                <Select
                  value={draft.itemCodeMode}
                  onValueChange={(value) => setDraft({ ...draft, itemCodeMode: value as InventorySettingsDto['itemCodeMode'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t('settings.inventory.codeManual')}</SelectItem>
                    <SelectItem value="auto">{t('settings.inventory.codeAuto')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.inventory.itemCodeHint')}</p>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">{t('settings.inventory.barcodeMode')}</label>
                <Select
                  value={draft.barcodeMode}
                  onValueChange={(value) => setDraft({ ...draft, barcodeMode: value as InventorySettingsDto['barcodeMode'] })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="manual">{t('settings.inventory.barcodeManual')}</SelectItem>
                    <SelectItem value="auto">{t('settings.inventory.barcodeAuto')}</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">{t('settings.inventory.barcodeHint')}</p>
              </div>
              <div className="grid gap-1.5">
                <label className="text-sm font-medium">{t('settings.inventory.defaultUnit')}</label>
                <UnitOfMeasureField
                  value={draft.defaultUnitOfMeasureId ?? ''}
                  onChange={(value) => setDraft({ ...draft, defaultUnitOfMeasureId: value || null })}
                />
                <p className="text-xs text-muted-foreground">{t('settings.inventory.defaultUnitHint')}</p>
              </div>
            </div>
            {draft.barcodeMode === 'auto' ? (
              <div className="grid max-w-xs gap-1.5">
                <label className="text-sm font-medium">{t('settings.inventory.barcodePrefix')}</label>
                <Input
                  dir="ltr"
                  inputMode="numeric"
                  value={draft.barcodePrefix}
                  onChange={(e) => setDraft({ ...draft, barcodePrefix: e.target.value.trim() })}
                />
                <p className={prefixValid ? 'text-xs text-muted-foreground' : 'text-xs text-destructive'}>
                  {t('settings.inventory.barcodePrefixHint')}
                </p>
              </div>
            ) : null}
            <div className="grid gap-3 border-t pt-5">
              <label className="flex items-center gap-2 text-sm font-medium">
                <Checkbox
                  checked={draft.scaleBarcodeEnabled}
                  onCheckedChange={(checked) => setDraft({ ...draft, scaleBarcodeEnabled: checked === true })}
                />
                {t('settings.inventory.scaleEnabled')}
              </label>
              <p className="text-xs text-muted-foreground">{t('settings.inventory.scaleHint')}</p>
              {draft.scaleBarcodeEnabled ? (
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium">{t('settings.inventory.scalePrefix')}</label>
                    <Input
                      dir="ltr"
                      inputMode="numeric"
                      value={draft.scaleBarcodePrefix}
                      onChange={(e) => setDraft({ ...draft, scaleBarcodePrefix: e.target.value.trim() })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium">{t('settings.inventory.scaleCodeLength')}</label>
                    <Input
                      dir="ltr"
                      type="number"
                      min={3}
                      max={7}
                      value={draft.scaleItemCodeLength}
                      onChange={(e) => setDraft({ ...draft, scaleItemCodeLength: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium">{t('settings.inventory.scaleValueType')}</label>
                    <Select
                      value={draft.scaleValueType}
                      onValueChange={(value) =>
                        setDraft({ ...draft, scaleValueType: value as InventorySettingsDto['scaleValueType'] })
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="weight">{t('settings.inventory.scaleWeight')}</SelectItem>
                        <SelectItem value="price">{t('settings.inventory.scalePrice')}</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="grid gap-1.5">
                    <label className="text-sm font-medium">{t('settings.inventory.scaleDecimals')}</label>
                    <Input
                      dir="ltr"
                      type="number"
                      min={0}
                      max={3}
                      value={draft.scaleValueDecimals}
                      onChange={(e) => setDraft({ ...draft, scaleValueDecimals: Number(e.target.value) || 0 })}
                    />
                  </div>
                  <p className={`text-xs sm:col-span-4 ${scaleValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                    {t('settings.inventory.scaleLayout', {
                      prefix: draft.scaleBarcodePrefix.length,
                      code: draft.scaleItemCodeLength,
                      value: 12 - draft.scaleBarcodePrefix.length - draft.scaleItemCodeLength,
                    })}
                  </p>
                </div>
              ) : null}
            </div>
            <div>
              <Button onClick={save} disabled={update.isPending || !prefixValid || !scaleValid}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
