import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Checkbox,
  FormControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@erp-platform/ui';

import { usePurchaseRequisitions } from '../../api/purchase-requisitions/queries';
import { useSuppliers } from '../../api/suppliers/queries';

export const NO_SOURCE_REQUISITION = '__none__';

/** Only 'approved' requisitions are valid sources — RfqsService.create() rejects anything
 * else server-side; filtered here so the picker only offers choices that will be accepted. */
export function SourceRequisitionField({
  value,
  onChange,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
}) {
  const { t } = useTranslation();
  const { data: requisitions } = usePurchaseRequisitions();
  const approved = useMemo(
    () => (requisitions ?? []).filter((r) => r.status === 'approved'),
    [requisitions],
  );

  return (
    <Select
      onValueChange={(next) => onChange(next === NO_SOURCE_REQUISITION ? null : next)}
      value={value ?? NO_SOURCE_REQUISITION}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={NO_SOURCE_REQUISITION}>{t('purchases.rfqs.noSourceRequisition')}</SelectItem>
        {approved.map((requisition) => (
          <SelectItem key={requisition.id} value={requisition.id}>
            {requisition.requisitionNumber}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/**
 * Plain controlled checklist (not a react-hook-form field) for the suppliers invited to
 * quote — a scrollable list of checkboxes, same composition style as
 * ApplyLandedCostForm's movement checklist in Inventory (Checkbox + click-to-toggle row),
 * just for a fixed list instead of a dynamically-filtered one. No multi-select primitive
 * exists in libs/ui yet, so this composes from Checkbox rather than adding one.
 */
export function SupplierChecklist({
  selectedIds,
  onChange,
}: {
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const { t } = useTranslation();
  const { data: suppliers } = useSuppliers();
  const selected = useMemo(() => new Set(selectedIds), [selectedIds]);

  function toggle(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(Array.from(next));
  }

  return (
    <div className="max-h-48 overflow-y-auto rounded-md border p-2">
      {(suppliers ?? []).map((supplier) => (
        <label
          key={supplier.id}
          className="flex cursor-pointer items-center gap-2 rounded-sm px-1.5 py-1 text-sm hover:bg-muted"
        >
          <Checkbox checked={selected.has(supplier.id)} onCheckedChange={() => toggle(supplier.id)} />
          {supplier.name}
        </label>
      ))}
      {(suppliers ?? []).length === 0 ? (
        <p className="px-1.5 py-1 text-sm text-muted-foreground">{t('common.noResults')}</p>
      ) : null}
    </div>
  );
}
