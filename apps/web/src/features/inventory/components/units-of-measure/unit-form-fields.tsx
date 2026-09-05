import { useTranslation } from 'react-i18next';
import type { UnitOfMeasureDto } from '@erp-platform/contracts';
import { FormControl, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

/** Select sentinel for "no base unit — this is a base unit itself" (baseUnitId: null). */
export const NO_BASE_UNIT = '__none__';

/**
 * Base-unit select shared by the create/edit forms. Unit conversion stays
 * one level deep (CLAUDE.md / Stage 2 decision): only units that are
 * themselves base units (baseUnitId === null) are offered, and never the
 * unit currently being edited — this mirrors
 * UnitsOfMeasureService.assertValidBaseUnit() on the backend so the UI
 * never lets a user attempt an invalid chain.
 */
export function BaseUnitField({
  value,
  onChange,
  options,
}: {
  value: string | null | undefined;
  onChange: (value: string | null) => void;
  options: UnitOfMeasureDto[];
}) {
  const { t } = useTranslation();
  return (
    <Select
      onValueChange={(next) => onChange(next === NO_BASE_UNIT ? null : next)}
      value={value ?? NO_BASE_UNIT}
    >
      <FormControl>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
      </FormControl>
      <SelectContent>
        <SelectItem value={NO_BASE_UNIT}>{t('inventory.unitsOfMeasure.baseUnitBadge')}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option.id} value={option.id}>
            {option.name} ({option.symbol})
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
