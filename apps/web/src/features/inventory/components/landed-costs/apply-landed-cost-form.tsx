import { useMemo, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import type { LandedCostAllocationMethodDto } from '@erp-platform/contracts';
import {
  Button,
  Checkbox,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Textarea,
  toast,
} from '@erp-platform/ui';

import { useProduct, useProducts } from '../../api/products/queries';
import { useWarehouseLocations, useWarehouses } from '../../api/warehouses/queries';
import { useStockMovements } from '../../api/stock/queries';
import { useApplyLandedCost } from '../../api/landed-costs/queries';
import { useTenantSettings } from '../../../settings/queries';
import { ApiError } from '../../../../lib/api-client';
import { decimalToMinorUnits, formatMoney } from '../../../../lib/money';
import { useVariantIndex } from '../../hooks/landed-costs/use-variant-index';
import { useLocationLookups } from '../../hooks/landed-costs/use-location-lookups';

/**
 * Plain controlled state, not react-hook-form + zodResolver: the movement-selection checklist
 * (a dynamic list of candidate stock movements fetched from filters, with a Set<string> of
 * selected ids) and the cascading product/warehouse filters make this form's shape too dynamic
 * to safely register against one static Zod schema without a working `tsc` in this session (see
 * project docs). The backend's `applyLandedCostSchema` remains the source of truth for validation;
 * a rejected request surfaces the backend's own error message via ApiError. Only movements with
 * movementType 'in' and a recorded unitCost are eligible (enforced server-side by
 * LandedCostsService.fetchEligibleMovement) — filtered client-side here so the picker only shows
 * choices that will actually be accepted.
 */
export function ApplyLandedCostForm({ onDone }: { onDone: () => void }) {
  const { t } = useTranslation();
  const applyLandedCost = useApplyLandedCost();
  const { data: tenantSettings } = useTenantSettings();
  const variantIndex = useVariantIndex();
  const { warehouseById, locationById } = useLocationLookups();

  const [totalCost, setTotalCost] = useState('');
  const [allocationMethod, setAllocationMethod] = useState<LandedCostAllocationMethodDto>('by_value');
  const [filterProductId, setFilterProductId] = useState<string | undefined>();
  const [filterVariantId, setFilterVariantId] = useState<string | undefined>();
  const [filterWarehouseId, setFilterWarehouseId] = useState<string | undefined>();
  const [filterLocationId, setFilterLocationId] = useState<string | undefined>();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [referenceType, setReferenceType] = useState('');
  const [referenceId, setReferenceId] = useState('');
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: products } = useProducts();
  const { data: productDetail } = useProduct(filterProductId);
  const { data: warehouses } = useWarehouses();
  const { data: locations } = useWarehouseLocations(filterWarehouseId);

  const { data: movements } = useStockMovements({
    productVariantId: filterVariantId,
    warehouseId: filterWarehouseId,
    locationId: filterLocationId,
    limit: 100,
  });
  const eligibleMovements = useMemo(
    () => (movements ?? []).filter((m) => m.movementType === 'in' && m.unitCost !== null),
    [movements],
  );

  function toggleMovement(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!totalCost || selectedIds.size === 0) {
      setError(t('inventory.stock.fillRequiredFields'));
      return;
    }
    try {
      await applyLandedCost.mutateAsync({
        totalCost: { amountMinorUnits: decimalToMinorUnits(totalCost), currency: tenantSettings?.currencyCode ?? 'EGP' },
        allocationMethod,
        stockMovementIds: Array.from(selectedIds),
        referenceType: referenceType || undefined,
        referenceId: referenceId || undefined,
        notes: notes || undefined,
      });
      toast.success(t('inventory.landedCosts.applySuccess'));
      onDone();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t('inventory.landedCosts.applyError'));
    }
  }

  return (
    <form onSubmit={handleSubmit} className="grid gap-4">
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.landedCosts.totalCost')}</label>
          <Input inputMode="decimal" placeholder="0.00" value={totalCost} onChange={(e) => setTotalCost(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.landedCosts.allocationMethod')}</label>
          <Select value={allocationMethod} onValueChange={(v) => setAllocationMethod(v as LandedCostAllocationMethodDto)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="by_value">{t('inventory.landedCosts.byValue')}</SelectItem>
              <SelectItem value="by_quantity">{t('inventory.landedCosts.byQuantity')}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-2 rounded-md border p-3">
        <p className="text-sm font-medium">{t('inventory.landedCosts.selectMovements')}</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.stock.product')}</label>
            <Select
              value={filterProductId}
              onValueChange={(id) => {
                setFilterProductId(id);
                setFilterVariantId(undefined);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.stock.selectProduct')} />
              </SelectTrigger>
              <SelectContent>
                {(products ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} ({p.code})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.stock.variant')}</label>
            <Select value={filterVariantId} onValueChange={setFilterVariantId} disabled={!productDetail}>
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.stock.selectVariant')} />
              </SelectTrigger>
              <SelectContent>
                {(productDetail?.variants ?? []).map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.sku}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.stock.warehouse')}</label>
            <Select
              value={filterWarehouseId}
              onValueChange={(id) => {
                setFilterWarehouseId(id);
                setFilterLocationId(undefined);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.stock.selectWarehouse')} />
              </SelectTrigger>
              <SelectContent>
                {(warehouses ?? []).map((w) => (
                  <SelectItem key={w.id} value={w.id}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <label className="text-sm font-medium">{t('inventory.stock.location')}</label>
            <Select value={filterLocationId} onValueChange={setFilterLocationId} disabled={!filterWarehouseId}>
              <SelectTrigger>
                <SelectValue placeholder={t('inventory.stock.selectLocation')} />
              </SelectTrigger>
              <SelectContent>
                {(locations ?? []).map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-10" />
                <TableHead>{t('inventory.stock.date')}</TableHead>
                <TableHead>{t('inventory.stock.product')}</TableHead>
                <TableHead>{t('inventory.stock.location')}</TableHead>
                <TableHead>{t('inventory.stock.quantity')}</TableHead>
                <TableHead>{t('inventory.stock.unitCost')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eligibleMovements.map((m) => (
                <TableRow key={m.id} className="cursor-pointer" onClick={() => toggleMovement(m.id)}>
                  <TableCell onClick={(e) => e.stopPropagation()}>
                    <Checkbox checked={selectedIds.has(m.id)} onCheckedChange={() => toggleMovement(m.id)} />
                  </TableCell>
                  <TableCell>{new Date(m.createdAt).toLocaleDateString('ar-EG')}</TableCell>
                  <TableCell>
                    {variantIndex.get(m.productVariantId)?.productName ?? '—'} ({variantIndex.get(m.productVariantId)?.sku ?? '—'})
                  </TableCell>
                  <TableCell>
                    {warehouseById.get(m.warehouseId)?.name ?? '—'} / {locationById.get(m.locationId)?.name ?? '—'}
                  </TableCell>
                  <TableCell>{m.quantity}</TableCell>
                  <TableCell>{m.unitCost ? formatMoney(m.unitCost.amountMinorUnits, m.unitCost.currency) : '—'}</TableCell>
                </TableRow>
              ))}
              {eligibleMovements.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="py-6 text-center text-muted-foreground">
                    {t('common.noResults')}
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
        <p className="text-xs text-muted-foreground">
          {t('inventory.landedCosts.selectedCount', { count: selectedIds.size })}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.landedCosts.referenceTypeOptional')}</label>
          <Input value={referenceType} onChange={(e) => setReferenceType(e.target.value)} />
        </div>
        <div className="grid gap-1.5">
          <label className="text-sm font-medium">{t('inventory.landedCosts.referenceIdOptional')}</label>
          <Input value={referenceId} onChange={(e) => setReferenceId(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-1.5">
        <label className="text-sm font-medium">{t('inventory.stock.notesOptional')}</label>
        <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <Button type="submit" disabled={applyLandedCost.isPending} className="mt-2">
        {t('common.save')}
      </Button>
    </form>
  );
}
