import { useTranslation } from 'react-i18next';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@erp-platform/ui';

import { useBankAccountLookup } from '../../features/accounting/api/bank-accounts/queries';

const NONE = '__none__';

/**
 * "Deposited to / paid from" bank account for a receipt or a payment. Only
 * the accounts in the document's currency are offered; nothing renders when
 * the method is cash or the tenant has no bank accounts (the ledger then
 * uses the default bank account mapping).
 */
export function BankAccountSelect({
  value,
  onChange,
  currency,
  paymentMethod,
}: {
  value: string | null | undefined;
  onChange: (bankAccountId: string | null) => void;
  currency: string;
  paymentMethod: string;
}) {
  const { t } = useTranslation();
  const { data } = useBankAccountLookup();
  const accounts = (data ?? []).filter((account) => account.currency === currency);
  if (paymentMethod === 'cash' || accounts.length === 0) return null;
  return (
    <div className="grid gap-2">
      <span className="text-sm font-medium">{t('payments.bankAccount')}</span>
      <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>{t('payments.defaultBankAccount')}</SelectItem>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {account.name} — {account.bankName}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
