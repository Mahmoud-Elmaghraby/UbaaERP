/**
 * Supplier (master doc §10, step 3 — Purchases). Foundational entity:
 * every later Purchases document (RFQs, purchase orders, goods receipts,
 * purchase returns, purchase invoices) references one.
 */
export interface Supplier {
  id: string;
  name: string;
  code: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  taxNumber: string | null;
  /** Migration 0091 — withholding (خصم من المنبع) rule applied by default on this party's invoices. */
  withholdingTaxRuleId: string | null;
  /** ISO 4217 currency this supplier is normally billed in (master doc §10's "multi-currency per supplier"). */
  defaultCurrency: string;
  /** Net-terms convention (e.g. 30 = "net 30"). Null = no standing terms recorded. */
  paymentTermsDays: number | null;
  notes: string | null;
  isActive: boolean;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateSupplierInput {
  name: string;
  /** Empty → the next "supplier" number. */
  code?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  withholdingTaxRuleId?: string | null;
  defaultCurrency: string;
  paymentTermsDays?: number | null;
  notes?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}

export interface UpdateSupplierInput {
  name?: string;
  code?: string;
  contactPerson?: string | null;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  taxNumber?: string | null;
  withholdingTaxRuleId?: string | null;
  defaultCurrency?: string;
  paymentTermsDays?: number | null;
  notes?: string | null;
  isActive?: boolean;
  customFields?: Record<string, unknown>;
}
