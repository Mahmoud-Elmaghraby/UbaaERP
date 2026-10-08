import type { PrintPartyDto } from '@erp-platform/contracts';
import type { Supplier } from '../../domain/supplier.entity';

export function supplierParty(supplier: Supplier): PrintPartyDto {
  return {
    roleLabel: 'المورد',
    name: supplier.name,
    code: supplier.code,
    taxNumber: supplier.taxNumber,
    address: supplier.address,
    phone: supplier.phone,
  };
}
