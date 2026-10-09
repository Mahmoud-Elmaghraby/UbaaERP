import { forwardRef, type ComponentPropsWithoutRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useCurrencies } from '../../features/settings/queries';

type TriggerProps = Omit<ComponentPropsWithoutRef<typeof SelectTrigger>, 'onChange' | 'value'>;

/**
 * Every currency picker in the app (Settings › Currencies is its source):
 * the active currencies, plus the current value even if it was deactivated
 * since. Usable inside <FormControl> (it forwards the id/aria props).
 */
export const CurrencySelect = forwardRef<HTMLButtonElement, TriggerProps & {
  value: string | null | undefined;
  onChange: (code: string) => void;
  disabled?: boolean;
}>(function CurrencySelect({ value, onChange, disabled, className, ...triggerProps }, ref) {
  const { t } = useTranslation();
  const { data } = useCurrencies();
  const options = (data ?? []).filter((c) => c.isActive || c.code === value);
  return (
    <Select value={value || undefined} onValueChange={onChange} disabled={disabled}>
      <SelectTrigger ref={ref} className={className} {...triggerProps}>
        <SelectValue placeholder={t('settings.currencies.select')} />
      </SelectTrigger>
      <SelectContent>
        {options.map((c) => (
          <SelectItem key={c.code} value={c.code}>
            <span dir="ltr" className="font-mono text-xs">{c.code}</span> — {c.name}
          </SelectItem>
        ))}
        {value && !options.some((c) => c.code === value) ? <SelectItem value={value}>{value}</SelectItem> : null}
      </SelectContent>
    </Select>
  );
});
