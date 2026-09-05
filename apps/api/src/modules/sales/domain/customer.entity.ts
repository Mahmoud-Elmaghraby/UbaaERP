/**
 * Customer (master doc §10, step 4 — Sales). Foundational entity: every
 * later Sales document (quotations, sales orders, deliveries, sales
 * invoices, payments received) references one. Mirror image of Supplier
 * in Purchases — see that entity's file comment for the shared field
 * rationale; `customerType` is the one field with no Supplier
 * equivalent (see migration 0039's comment for why).
 */
export type CustomerType = 'business' | 'individual';

export interface Customer {
  id: string;
  name: string;
  code: string;
  /** Drives e-invoice vs e-receipt at the ETA integration stage (claude/sales-einvoice-spike.md §1) — not used by anything yet. */
  customerType: CustomerType;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  /** ISO 4217 currency this customer is normally billed in. */
  defaultCurrency: string;
  /** Net-terms convention (e.g. 30 = "net 30"). Null = no standing terms recorded. */
  paymentTermsDays: number | null;
  notes: string | null;
  isActive: boolean;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCustomerInput {
  name: string;
  code: string;
  customerType?: CustomerType;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  defaultCurrency: string;
  paymentTermsDays?: number | null;
  notes?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}

export interface UpdateCustomerInput {
  name?: string;
  code?: string;
  customerType?: CustomerType;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  defaultCurrency?: string;
  paymentTermsDays?: number | null;
  notes?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}
