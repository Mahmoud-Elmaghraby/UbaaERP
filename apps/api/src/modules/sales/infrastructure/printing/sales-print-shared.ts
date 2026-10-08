import type { PrintPartyDto } from '@erp-platform/contracts';
import type { Customer } from '../../domain/customer.entity';

export function customerParty(customer: Customer): PrintPartyDto {
  return {
    roleLabel: 'العميل',
    name: customer.name,
    code: customer.code,
    taxNumber: customer.taxNumber,
    address: customer.address,
    phone: customer.phone,
  };
}
