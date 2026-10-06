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

/**
 * Settings › Modules › Inventory: how item codes and barcodes are produced.
 * "Auto" item codes use the 'product' numbering sequence (prefix and padding
 * are editable in the Numbering tab, created on first use as ITM-00001).
 */
export function InventorySettingsSection() {
  const { t } = useTranslation();
  const { data: settings, isLoading } = useInventorySettings();
  const update = useUpdateInventorySettings();
  const [draft, setDraft] = useState<Pick<InventorySettingsDto, 'itemCodeMode' | 'barcodeMode' | 'barcodePrefix'> | null>(
    null,
  );

  useEffect(() => {
    if (settings) setDraft({ itemCodeMode: settings.itemCodeMode, barcodeMode: settings.barcodeMode, barcodePrefix: settings.barcodePrefix });
  }, [settings]);

  const prefixValid = draft ? /^[0-9]{1,7}$/.test(draft.barcodePrefix) : true;

  async function save() {
    if (!draft || !prefixValid) return;
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
            <div>
              <Button onClick={save} disabled={update.isPending || !prefixValid}>
                {t('common.save')}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
