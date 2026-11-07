import { useTranslation } from 'react-i18next';
import type { CustomerDto } from '@erp-platform/contracts';
import { useHasPermission } from '@erp-platform/ui';

import { useCreateCustomer, useCustomers } from '../api/customers/queries';
import { useBaseCurrency } from '../../settings/queries';
import { PartyPicker } from '../../../components/party/party-picker';

/**
 * THE customer field of every sales document: searchable (code, name, phone),
 * active customers only, and a "+ new customer" that creates one with just a
 * name and a phone without leaving the document.
 */
export function CustomerPicker({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (customerId: string, customer: CustomerDto) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: customers } = useCustomers();
  const canCreate = useHasPermission('sales.manage');
  const create = useCreateCustomer();
  const currency = useBaseCurrency();

  return (
    <PartyPicker
      items={customers}
      value={value}
      onChange={onChange}
      className={className}
      disabled={disabled}
      onCreate={canCreate ? (input) => create.mutateAsync({ ...input, defaultCurrency: currency }) : undefined}
      labels={{
        placeholder: t('sales.customerPicker.placeholder'),
        search: t('sales.customerPicker.search'),
        new: t('sales.customerPicker.new'),
        name: t('sales.customerPicker.name'),
        phone: t('sales.customerPicker.phone'),
        created: (name) => t('sales.customerPicker.created', { name }),
        moreLater: t('sales.customerPicker.moreLater'),
      }}
    />
  );
}
