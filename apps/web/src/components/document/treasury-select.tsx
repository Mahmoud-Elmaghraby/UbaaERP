import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useTreasuryLookup } from '../../features/treasury/api/queries';

/**
 * "Received into / paid from" treasury for a receipt, a payment or a POS
 * session — only treasuries holding the document's currency. For a cash
 * method the default cash box is preselected; for other methods the default
 * of the matching kind (bank) when there is one.
 */
export function TreasurySelect({
  value,
  onChange,
  currency,
  paymentMethod,
  label,
}: {
  value: string | null | undefined;
  onChange: (treasuryId: string | null) => void;
  currency: string;
  paymentMethod?: string;
  label?: string;
}) {
  const { t } = useTranslation();
  const { data } = useTreasuryLookup();
  const treasuries = (data ?? []).filter((treasury) => treasury.currency === currency);

  useEffect(() => {
    if (value && treasuries.some((treasury) => treasury.id === value)) return;
    const wantedKind = !paymentMethod || paymentMethod === 'cash' ? 'cash' : 'bank';
    const preferred =
      treasuries.find((treasury) => treasury.kind === wantedKind && treasury.isDefault) ??
      treasuries.find((treasury) => treasury.kind === wantedKind) ??
      (wantedKind === 'cash' ? treasuries[0] : undefined);
    const next = preferred?.id ?? null;
    if (next !== (value ?? null)) onChange(next);
  }, [data, currency, paymentMethod]);

  if (treasuries.length === 0) return null;
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{label ?? t('treasury.select.label')}</span>
      <Select value={value ?? undefined} onValueChange={(next) => onChange(next)}>
        <SelectTrigger>
          <SelectValue placeholder={t('treasury.select.placeholder')} />
        </SelectTrigger>
        <SelectContent>
          {treasuries.map((treasury) => (
            <SelectItem key={treasury.id} value={treasury.id}>
              {treasury.name} — {t(`treasury.kinds.${treasury.kind}`)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
