import { useTranslation } from 'react-i18next';
import type { SupplierDto } from '@erp-platform/contracts';
import { useHasPermission } from '@erp-platform/ui';

import { useCreateSupplier, useSuppliers } from '../api/suppliers/queries';
import { useBaseCurrency } from '../../settings/queries';
import { PartyPicker } from '../../../components/party/party-picker';
import { PURCH } from '../../../lib/permissions';

/** THE supplier field of every purchase document — same behaviour as CustomerPicker. */
export function SupplierPicker({
  value,
  onChange,
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (supplierId: string, supplier: SupplierDto) => void;
  className?: string;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { data: suppliers } = useSuppliers();
  const canCreate = useHasPermission(PURCH.create);
  const create = useCreateSupplier();
  const currency = useBaseCurrency();

  return (
    <PartyPicker
      items={suppliers}
      value={value}
      onChange={onChange}
      className={className}
      disabled={disabled}
      onCreate={canCreate ? (input) => create.mutateAsync({ ...input, defaultCurrency: currency }) : undefined}
      labels={{
        placeholder: t('purchases.supplierPicker.placeholder'),
        search: t('purchases.supplierPicker.search'),
        new: t('purchases.supplierPicker.new'),
        name: t('purchases.supplierPicker.name'),
        phone: t('purchases.supplierPicker.phone'),
        created: (name) => t('purchases.supplierPicker.created', { name }),
        moreLater: t('purchases.supplierPicker.moreLater'),
      }}
    />
  );
}
