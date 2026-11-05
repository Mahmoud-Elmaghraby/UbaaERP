import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useSalesReps } from '../../api/sales-reps/queries';

const NONE = '__none__';

/**
 * Picks a sales rep (or none). Only active reps are offered; the current
 * value stays visible even if that rep was deactivated meanwhile.
 */
export function SalesRepSelect({
  value,
  onChange,
  className,
  disabled,
  id,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  className?: string;
  disabled?: boolean;
  id?: string;
}) {
  const { t } = useTranslation();
  const { data: reps } = useSalesReps();
  const options = (reps ?? []).filter((rep) => rep.isActive || rep.id === value);

  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)} disabled={disabled}>
      <SelectTrigger id={id} className={className} aria-label={t('salesReps.field')}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NONE}>{t('salesReps.none')}</SelectItem>
        {options.map((rep) => (
          <SelectItem key={rep.id} value={rep.id}>
            {rep.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

/** A rep's name for display ('—' when none). */
export function useSalesRepName(id: string | null | undefined): string | null {
  const { data: reps } = useSalesReps();
  if (!id) return null;
  return reps?.find((rep) => rep.id === id)?.name ?? null;
}
