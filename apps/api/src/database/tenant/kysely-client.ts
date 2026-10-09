import { Kysely, PostgresDialect, type Generated } from 'kysely';
import { Pool, types, type CustomTypesConfig } from 'pg';

/**
 * Tenant-schema Kysely client factory (CLAUDE.md §2.2, §2.3).
 *
 * Kysely is used for ALL tenant-schema access — never Prisma, which is
 * reserved for the public/platform schema (see ../../../prisma/schema.prisma).
 * Each call connects to one tenant's own Postgres schema via `search_path`,
 * reflecting schema-per-tenant isolation at the connection level (§2.3):
 * no `tenant_id` column, no shared table.
 *
 * `TenantDatabase` grows one row-type entry per tenant-schema table, added
 * here as each table's migration is written (see ./migrations/). Row
 * shapes use snake_case to match the actual Postgres column names — Kysely
 * has no implicit camelCase mapping, and repositories map to camelCase
 * domain types explicitly at the infrastructure boundary.
 */
export interface SchemaMigrationsTable {
  id: string;
  migration_file: string;
  applied_at: Date;
}

export interface TenantSettingsTable {
  id: string;
  singleton: boolean;
  currency_code: string;
  company_name: string | null;
  address: string | null;
  tax_registration_number: string | null;
  /** Migration 0093 — printed company header. */
  commercial_register: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  logo_object_key: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface BranchesTable {
  id: string;
  name: string;
  code: string;
  address: string | null;
  is_active: boolean;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface NumberingSequencesTable {
  id: string;
  document_type: string;
  branch_id: string | null;
  prefix: string | null;
  next_number: number;
  padding_length: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DocumentTemplatesTable {
  id: string;
  document_type: string;
  name: string;
  content: string;
  is_default: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TaxRulesTable {
  id: string;
  name: string;
  rate: string;
  is_active: boolean;
  /** Migration 0091 — 'vat' | 'table' | 'withholding'. */
  kind: Generated<string>;
  eta_type: string | null;
  eta_subtype: string | null;
  /** Migration 0091 — 'sales' | 'purchases' | 'both'. */
  scope: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface CustomFieldDefinitionsTable {
  id: string;
  entity_type: string;
  field_key: string;
  label: string;
  field_type: string;
  options: unknown;
  is_required: boolean;
  display_order: number;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PermissionsTable {
  id: string;
  key: string;
  description: string;
  created_at: Generated<Date>;
}

export interface RolesTable {
  id: string;
  name: string;
  is_system: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RolePermissionsTable {
  role_id: string;
  permission_id: string;
}

export interface UsersTable {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  role_id: string;
  is_active: boolean;
  // Optional TOTP two-factor auth (migration 0066) — see
  // TwoFactorService's class comment for the pending/enabled two-step
  // design totp_secret_encrypted/totp_enabled together encode.
  totp_secret_encrypted: string | null;
  totp_enabled: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface UserBranchAccessTable {
  user_id: string;
  branch_id: string;
}

export interface ApprovalChainsTable {
  id: string;
  user_id: string;
  manager_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AuditLogsTable {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  metadata: unknown;
  created_at: Generated<Date>;
}

export interface RefreshTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Generated<Date>;
}

export interface AccountActionTokensTable {
  id: string;
  user_id: string;
  token_hash: string;
  purpose: string;
  expires_at: Date;
  used_at: Date | null;
  created_at: Generated<Date>;
}

export interface UserBackupCodesTable {
  id: string;
  user_id: string;
  code_hash: string;
  used_at: Date | null;
  created_at: Generated<Date>;
}


export interface UnitsOfMeasureTable {
  id: string;
  name: string;
  symbol: string;
  base_unit_id: string | null;
  conversion_factor: string;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WarehousesTable {
  id: string;
  name: string;
  code: string;
  address: string | null;
  branch_id: string | null;
  is_active: boolean;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductsTable {
  id: string;
  code: string;
  name: string;
  description: string | null;
  unit_of_measure_id: string;
  track_variants: boolean;
  tracking_type: string;
  attributes: unknown;
  is_active: boolean;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Migration 0075 — 'stock' | 'service'. */
  item_type: Generated<string>;
  category_id: string | null;
  brand_id: string | null;
  sale_price_amount: string | null;
  sale_price_currency: string | null;
  purchase_price_amount: string | null;
  purchase_price_currency: string | null;
  tax_rule_id: string | null;
}

/** Migration 0075. */
export interface InventorySettingsTable {
  id: string;
  singleton: Generated<boolean>;
  item_code_mode: Generated<string>;
  barcode_mode: Generated<string>;
  barcode_prefix: Generated<string>;
  /** Migration 0076 — scale (weighing) barcodes. */
  scale_barcode_enabled: Generated<boolean>;
  scale_barcode_prefix: Generated<string>;
  scale_item_code_length: Generated<number>;
  scale_value_type: Generated<string>;
  scale_value_decimals: Generated<number>;
  /** Migration 0097 — unit of a new product when none is chosen. */
  default_unit_of_measure_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0076 — extra / pack barcodes per variant. */
export interface ProductBarcodesTable {
  id: string;
  product_variant_id: string;
  barcode: string;
  quantity: Generated<string>;
  label: string | null;
  created_at: Generated<Date>;
}

/** Migration 0075. */
export interface ProductCategoriesTable {
  id: string;
  name: string;
  parent_id: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0075. */
export interface ProductBrandsTable {
  id: string;
  name: string;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductVariantsTable {
  id: string;
  product_id: string;
  sku: string;
  attribute_values: unknown;
  barcode: string | null;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface WarehouseLocationsTable {
  id: string;
  warehouse_id: string;
  code: string;
  name: string;
  is_active: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockLevelsTable {
  id: string;
  product_variant_id: string;
  warehouse_id: string;
  location_id: string;
  quantity_on_hand: string;
  reorder_point: string | null;
  average_cost_amount: string;
  average_cost_currency: string;
  inventory_value_amount: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockMovementsTable {
  id: string;
  product_variant_id: string;
  warehouse_id: string;
  location_id: string;
  movement_type: string;
  quantity: string;
  unit_cost_amount: string | null;
  unit_cost_currency: string | null;
  resulting_average_cost_amount: string;
  resulting_average_cost_currency: string;
  reference_type: string | null;
  reference_id: string | null;
  related_movement_id: string | null;
  stock_lot_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
  total_cost_amount: string | null;
}

export interface StockCountsTable {
  id: string;
  count_number: string;
  kind: string;
  warehouse_id: string;
  status: Generated<string>;
  count_date: string | null;
  notes: string | null;
  created_by: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockCountLinesTable {
  id: string;
  stock_count_id: string;
  product_variant_id: string;
  location_id: string;
  lot_number: string | null;
  expiry_date: string | null;
  system_quantity: Generated<string>;
  counted_quantity: string | null;
  unit_cost_amount: string | null;
  unit_cost_currency: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface ProductUnitsTable {
  id: string;
  product_id: string;
  unit_of_measure_id: string;
  factor: string;
  sale_price_amount: string | null;
  sale_price_currency: string | null;
  purchase_price_amount: string | null;
  purchase_price_currency: string | null;
  is_default_sale: Generated<boolean>;
  is_default_purchase: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockLotsTable {
  id: string;
  product_variant_id: string;
  lot_number: string;
  expiry_date: string | null;
  unit_cost_amount: string;
  unit_cost_currency: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockLotLevelsTable {
  id: string;
  stock_lot_id: string;
  location_id: string;
  warehouse_id: string;
  quantity_on_hand: string;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockLotConsumptionsTable {
  id: string;
  stock_movement_id: string;
  stock_lot_id: string;
  quantity: string;
  created_at: Generated<Date>;
}

export interface LandedCostsTable {
  id: string;
  total_cost_amount: string;
  total_cost_currency: string;
  allocation_method: string;
  reference_type: string | null;
  reference_id: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface LandedCostAllocationsTable {
  id: string;
  landed_cost_id: string;
  stock_movement_id: string;
  product_variant_id: string;
  location_id: string;
  warehouse_id: string;
  allocated_amount_amount: string;
  allocated_amount_currency: string;
  resulting_average_cost_amount: string;
  resulting_average_cost_currency: string;
  expensed_amount: Generated<string>;
  created_at: Generated<Date>;
}

export interface SuppliersTable {
  id: string;
  name: string;
  code: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  /** Migration 0091 — withholding rule applied by default on this party's invoices. */
  withholding_tax_rule_id: string | null;
  default_currency: string;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: boolean;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Migration 0094 — signed, minor units; see that migration for the sign convention. */
  opening_balance_amount: Generated<string>;
  opening_balance_currency: string | null;
  opening_balance_date: string | null;
}

export interface CustomersTable {
  id: string;
  name: string;
  code: string;
  customer_type: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  address: string | null;
  tax_number: string | null;
  /** Migration 0091 — withholding rule applied by default on this party's invoices. */
  withholding_tax_rule_id: string | null;
  default_currency: string;
  payment_terms_days: number | null;
  notes: string | null;
  is_active: boolean;
  /** Migration 0063 — POS feature Stage 2's Walk-in Customer. At most one TRUE row per tenant (partial UNIQUE index). */
  is_system_default: boolean;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Migration 0094 — signed, minor units; see that migration for the sign convention. */
  opening_balance_amount: Generated<string>;
  opening_balance_currency: string | null;
  opening_balance_date: string | null;
}

export interface SalesOrdersTable {
  id: string;
  so_number: string;
  customer_id: string;
  source_quotation_id: string | null;
  status: string;
  /** Migration 0062 — POS feature Stage 2. Null for orders created before that migration. */
  currency: string | null;
  discount_type: string | null;
  /** NUMERIC(6,3) — string in/out, same convention as TaxRulesTable.rate. */
  discount_percentage: string | null;
  discount_fixed_amount: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesOrderLinesTable {
  id: string;
  sales_order_id: string;
  product_variant_id: string;
  quantity: string;
  unit_price_amount: string;
  unit_price_currency: string;
  /** Migration 0062 — POS feature Stage 2. */
  discount_type: string | null;
  discount_percentage: string | null;
  discount_fixed_amount: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface DeliveriesTable {
  id: string;
  delivery_number: string;
  sales_order_id: string;
  warehouse_id: string;
  status: string;
  delivery_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface DeliveryLinesTable {
  id: string;
  delivery_id: string;
  sales_order_line_id: string;
  product_variant_id: string;
  quantity_delivered: string;
  notes: string | null;
  /** Migration 0077 — lot/serial split of this line (JSON array). */
  lot_allocations: Generated<unknown>;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface SalesInvoicesTable {
  id: string;
  invoice_number: string;
  sales_order_id: string;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Migration 0092 — unit prices include VAT/table tax. */
  prices_include_tax: Generated<boolean>;
}

export interface SalesInvoiceLinesTable {
  id: string;
  sales_invoice_id: string;
  sales_order_line_id: string;
  product_variant_id: string;
  quantity_invoiced: string;
  unit_price_amount: string;
  unit_price_currency: string;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
  /** Migration 0092 — line net (null on older lines = unit price × quantity) and tax snapshot. */
  net_amount: string | null;
  taxes: Generated<unknown>;
}

export interface PaymentsReceivedTable {
  id: string;
  payment_number: string;
  customer_id: string;
  status: string;
  payment_date: string | null;
  payment_method: string;
  reference_number: string | null;
  amount_amount: string;
  amount_currency: string;
  notes: string | null;
  custom_fields: unknown;
  /** Migration 0060 — tags a payment as recorded within a POS cash session; null for every non-POS payment. */
  pos_session_id: string | null;
  /** Migration 0095 (was bank_account_id, 0089) — the treasury the money went into. */
  treasury_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PaymentAllocationsTable {
  id: string;
  payment_received_id: string;
  sales_invoice_id: string;
  allocated_amount_amount: string;
  allocated_amount_currency: string;
  created_at: Generated<Date>;
}

/** Migration 0090 — Supplier Payments (Purchases mirror of payments_received). */
export interface SupplierPaymentsTable {
  id: string;
  payment_number: string;
  supplier_id: string;
  status: string;
  payment_date: string | null;
  payment_method: string;
  reference_number: string | null;
  amount_amount: string;
  amount_currency: string;
  /** Migration 0095 (was bank_account_id) — the treasury the money was paid from. */
  treasury_id: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupplierPaymentAllocationsTable {
  id: string;
  supplier_payment_id: string;
  purchase_invoice_id: string;
  allocated_amount_amount: string;
  allocated_amount_currency: string;
  created_at: Generated<Date>;
}

export interface SalesReturnsTable {
  id: string;
  return_number: string;
  delivery_id: string;
  status: string;
  return_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesReturnLinesTable {
  id: string;
  sales_return_id: string;
  delivery_line_id: string;
  product_variant_id: string;
  quantity_returned: string;
  reason: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface SalesCreditNotesTable {
  id: string;
  credit_note_number: string;
  sales_return_id: string;
  customer_id: string;
  currency: string;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SalesCreditNoteLinesTable {
  id: string;
  sales_credit_note_id: string;
  sales_return_line_id: string;
  product_variant_id: string;
  quantity: string;
  unit_price_amount: string;
  unit_price_currency: string;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
  /** Migration 0092 — line net (null on older lines = unit price × quantity) and tax snapshot. */
  net_amount: string | null;
  taxes: Generated<unknown>;
}

export interface QuotationsTable {
  id: string;
  quotation_number: string;
  customer_id: string;
  status: string;
  valid_until_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface QuotationLinesTable {
  id: string;
  quotation_id: string;
  product_variant_id: string;
  quantity: string;
  unit_price_amount: string;
  unit_price_currency: string;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface EtaCredentialsTable {
  id: string;
  singleton: boolean;
  client_id: string | null;
  client_secret_encrypted: string | null;
  tax_registration_number: string | null;
  environment: string;
  document_version: string;
  is_enabled: boolean;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseRequisitionsTable {
  id: string;
  requisition_number: string;
  requested_by: string;
  branch_id: string | null;
  status: string;
  needed_by_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseRequisitionLinesTable {
  id: string;
  requisition_id: string;
  product_variant_id: string;
  quantity: string;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface RequestForQuotationsTable {
  id: string;
  rfq_number: string;
  source_requisition_id: string | null;
  status: string;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface RfqLinesTable {
  id: string;
  rfq_id: string;
  product_variant_id: string;
  quantity: string;
  notes: string | null;
  created_at: Generated<Date>;
}

export interface RfqSuppliersTable {
  id: string;
  rfq_id: string;
  supplier_id: string;
  created_at: Generated<Date>;
}

export interface SupplierQuotationsTable {
  id: string;
  rfq_id: string;
  supplier_id: string;
  status: string;
  valid_until: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface SupplierQuotationLinesTable {
  id: string;
  quotation_id: string;
  product_variant_id: string;
  quantity: string;
  unit_price_amount: string;
  unit_price_currency: string;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface PurchaseOrdersTable {
  id: string;
  po_number: string;
  supplier_id: string;
  source_quotation_id: string | null;
  status: string;
  expected_delivery_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface PurchaseOrderLinesTable {
  id: string;
  purchase_order_id: string;
  product_variant_id: string;
  quantity: string;
  unit_price_amount: string;
  unit_price_currency: string;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface GoodsReceiptsTable {
  id: string;
  receipt_number: string;
  purchase_order_id: string;
  warehouse_id: string;
  status: string;
  received_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  exchange_rate: string | null;
}

export interface GoodsReceiptLinesTable {
  id: string;
  goods_receipt_id: string;
  purchase_order_line_id: string;
  product_variant_id: string;
  quantity_received: string;
  unit_cost_amount: string;
  unit_cost_currency: string;
  notes: string | null;
  /** Migration 0077 — lot/serial split of this line (JSON array). */
  lot_allocations: Generated<unknown>;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface PurchaseReturnsTable {
  id: string;
  return_number: string;
  goods_receipt_id: string;
  status: string;
  return_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0096 — debit note issued with a confirmed purchase return (invoiced part only). */
export interface PurchaseDebitNotesTable {
  id: string;
  debit_note_number: string;
  purchase_return_id: string;
  supplier_id: string;
  debit_note_date: string;
  currency: string;
  created_at: Generated<Date>;
}

export interface PurchaseDebitNoteLinesTable {
  id: string;
  purchase_debit_note_id: string;
  purchase_return_line_id: string;
  purchase_order_line_id: string;
  product_variant_id: string;
  /** Base units (the return line's quantity × unit factor, capped at what was invoiced). */
  base_quantity: string;
  net_amount: string;
  taxes: Generated<unknown>;
}

export interface PurchaseReturnLinesTable {
  id: string;
  purchase_return_id: string;
  goods_receipt_line_id: string;
  product_variant_id: string;
  quantity_returned: string;
  reason: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
}

export interface OutboxEventsTable {
  id: string;
  event_type: string;
  payload: unknown;
  status: string;
  attempts: number;
  last_error: string | null;
  created_at: Generated<Date>;
  processed_at: Date | null;
  claimed_at: Date | null;
  /** Migration 0087 — earliest time a failed attempt may be retried. */
  next_attempt_at: Date | null;
}

export interface PurchaseInvoicesTable {
  id: string;
  invoice_number: string;
  supplier_invoice_number: string | null;
  purchase_order_id: string;
  status: string;
  invoice_date: string | null;
  due_date: string | null;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Migration 0092 — unit prices include VAT/table tax. */
  prices_include_tax: Generated<boolean>;
}

export interface PurchaseInvoiceLinesTable {
  id: string;
  purchase_invoice_id: string;
  purchase_order_line_id: string;
  product_variant_id: string;
  quantity_invoiced: string;
  unit_price_amount: string;
  unit_price_currency: string;
  notes: string | null;
  created_at: Generated<Date>;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
  /** Migration 0092 — line net (null on older lines = unit price × quantity) and tax snapshot. */
  net_amount: string | null;
  taxes: Generated<unknown>;
}

/**
 * attachments (claude/attachments-strategy.md, confirmed 2026-09-12).
 * entity_type/entity_id form a polymorphic reference to a row in one of
 * several other tables (whichever entity_type names) — deliberately NOT
 * a real FK, since a single column pair can't target more than one
 * table; the whitelist itself is enforced both here at the app layer
 * (ATTACHMENT_ENTITY_TYPES) and as a DB CHECK constraint in migration
 * 0071. uploaded_by IS a real FK to users (never polymorphic).
 */
export interface AttachmentsTable {
  id: string;
  entity_type: string;
  entity_id: string;
  file_name: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: Generated<Date>;
}

/** Migration 0083 — warehouse transfer document. */
export interface StockTransfersTable {
  id: string;
  transfer_number: string;
  status: Generated<string>;
  from_warehouse_id: string;
  from_location_id: string;
  to_warehouse_id: string;
  to_location_id: string;
  transfer_date: Generated<string>;
  notes: string | null;
  created_by: string | null;
  dispatched_by: string | null;
  dispatched_at: Date | null;
  received_by: string | null;
  received_at: Date | null;
  cancelled_by: string | null;
  cancelled_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockTransferLinesTable {
  id: string;
  stock_transfer_id: string;
  line_number: number;
  product_variant_id: string;
  quantity: string;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
  /** JSON array of { lotNumber, quantity } in the line's unit, or null (FEFO). */
  lot_allocations: unknown;
  /** JSON array of { stockLotId, quantity (base), valueMinorUnits } frozen at dispatch. */
  dispatched: unknown;
  dispatched_value_amount: string | null;
  dispatched_value_currency: string | null;
  received_quantity: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0084 — why stock was adjusted (optional own GL account). */
export interface StockAdjustmentReasonsTable {
  id: string;
  name: string;
  direction: Generated<string>;
  account_id: string | null;
  is_active: Generated<boolean>;
  sort_order: Generated<number>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0084 — stock adjustment document (ADJ-). */
export interface StockAdjustmentsTable {
  id: string;
  adjustment_number: string;
  status: Generated<string>;
  warehouse_id: string;
  location_id: string;
  reason_id: string | null;
  adjustment_date: Generated<string>;
  notes: string | null;
  created_by: string | null;
  posted_by: string | null;
  posted_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface StockAdjustmentLinesTable {
  id: string;
  stock_adjustment_id: string;
  line_number: number;
  product_variant_id: string;
  direction: string;
  quantity: string;
  unit_of_measure_id: string | null;
  unit_factor: Generated<string>;
  unit_cost_amount: string | null;
  unit_cost_currency: string | null;
  lot_number: string | null;
  expiry_date: string | null;
  reason_id: string | null;
  posted_value_amount: string | null;
  posted_value_currency: string | null;
  notes: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0085 — item images (objects in the shared MinIO bucket). */
export interface ProductImagesTable {
  id: string;
  product_id: string;
  product_variant_id: string | null;
  storage_key: string;
  thumbnail_key: string;
  mime_type: string;
  size_bytes: number;
  is_primary: Generated<boolean>;
  sort_order: Generated<number>;
  created_by: string | null;
  created_at: Generated<Date>;
}

export interface TenantDatabase {
  schema_migrations: SchemaMigrationsTable;
  tenant_settings: TenantSettingsTable;
  branches: BranchesTable;
  numbering_sequences: NumberingSequencesTable;
  document_templates: DocumentTemplatesTable;
  tax_rules: TaxRulesTable;
  custom_field_definitions: CustomFieldDefinitionsTable;
  permissions: PermissionsTable;
  roles: RolesTable;
  role_permissions: RolePermissionsTable;
  users: UsersTable;
  user_branch_access: UserBranchAccessTable;
  approval_chains: ApprovalChainsTable;
  audit_logs: AuditLogsTable;
  refresh_tokens: RefreshTokensTable;
  account_action_tokens: AccountActionTokensTable;
  user_backup_codes: UserBackupCodesTable;
  units_of_measure: UnitsOfMeasureTable;
  warehouses: WarehousesTable;
  products: ProductsTable;
  inventory_settings: InventorySettingsTable;
  product_categories: ProductCategoriesTable;
  product_brands: ProductBrandsTable;
  product_barcodes: ProductBarcodesTable;
  product_variants: ProductVariantsTable;
  warehouse_locations: WarehouseLocationsTable;
  stock_levels: StockLevelsTable;
  stock_movements: StockMovementsTable;
  landed_costs: LandedCostsTable;
  landed_cost_allocations: LandedCostAllocationsTable;
  stock_lots: StockLotsTable;
  stock_lot_levels: StockLotLevelsTable;
  stock_lot_consumptions: StockLotConsumptionsTable;
  stock_counts: StockCountsTable;
  product_units: ProductUnitsTable;
  stock_count_lines: StockCountLinesTable;
  stock_transfers: StockTransfersTable;
  stock_transfer_lines: StockTransferLinesTable;
  stock_adjustment_reasons: StockAdjustmentReasonsTable;
  stock_adjustments: StockAdjustmentsTable;
  stock_adjustment_lines: StockAdjustmentLinesTable;
  product_images: ProductImagesTable;
  suppliers: SuppliersTable;
  purchase_requisitions: PurchaseRequisitionsTable;
  purchase_requisition_lines: PurchaseRequisitionLinesTable;
  request_for_quotations: RequestForQuotationsTable;
  rfq_lines: RfqLinesTable;
  rfq_suppliers: RfqSuppliersTable;
  supplier_quotations: SupplierQuotationsTable;
  supplier_quotation_lines: SupplierQuotationLinesTable;
  purchase_orders: PurchaseOrdersTable;
  purchase_order_lines: PurchaseOrderLinesTable;
  goods_receipts: GoodsReceiptsTable;
  goods_receipt_lines: GoodsReceiptLinesTable;
  purchase_returns: PurchaseReturnsTable;
  purchase_debit_notes: PurchaseDebitNotesTable;
  purchase_debit_note_lines: PurchaseDebitNoteLinesTable;
  purchase_return_lines: PurchaseReturnLinesTable;
  outbox_events: OutboxEventsTable;
  purchase_invoices: PurchaseInvoicesTable;
  purchase_invoice_lines: PurchaseInvoiceLinesTable;
  customers: CustomersTable;
  eta_credentials: EtaCredentialsTable;
  quotations: QuotationsTable;
  quotation_lines: QuotationLinesTable;
  sales_orders: SalesOrdersTable;
  sales_order_lines: SalesOrderLinesTable;
  deliveries: DeliveriesTable;
  delivery_lines: DeliveryLinesTable;
  sales_invoices: SalesInvoicesTable;
  sales_invoice_lines: SalesInvoiceLinesTable;
  payments_received: PaymentsReceivedTable;
  payment_allocations: PaymentAllocationsTable;
  supplier_payments: SupplierPaymentsTable;
  supplier_payment_allocations: SupplierPaymentAllocationsTable;
  sales_returns: SalesReturnsTable;
  sales_return_lines: SalesReturnLinesTable;
  sales_credit_notes: SalesCreditNotesTable;
  sales_credit_note_lines: SalesCreditNoteLinesTable;
  chart_of_accounts: ChartOfAccountsTable;
  fiscal_years: FiscalYearsTable;
  accounting_periods: AccountingPeriodsTable;
  journal_entries: JournalEntriesTable;
  journal_entry_lines: JournalEntryLinesTable;
  accounting_settings: AccountingSettingsTable;
  cost_centers: CostCentersTable;
  treasuries: TreasuriesTable;
  treasury_categories: TreasuryCategoriesTable;
  treasury_vouchers: TreasuryVouchersTable;
  pos_sessions: PosSessionsTable;
  tenant_feature_toggles: TenantFeatureTogglesTable;
  attachments: AttachmentsTable;
  exchange_rates: ExchangeRatesTable;
}

const SCHEMA_NAME_PATTERN = /^[a-z][a-z0-9_]*$/;

/**
 * Validates a tenant schema name before it's interpolated into a raw SQL
 * connection option or DDL statement. Defense in depth: schema names
 * originate from public.tenants (trusted), but nothing here should ever
 * trust a string blindly before using it in raw SQL.
 */
export function assertValidSchemaName(schemaName: string): void {
  if (!SCHEMA_NAME_PATTERN.test(schemaName)) {
    throw new Error(
      `Invalid tenant schema name "${schemaName}": must be lowercase, start ` +
        `with a letter, and contain only letters, digits, and underscores.`,
    );
  }
}

/**
 * DATE columns come back as the 'YYYY-MM-DD' text Postgres sent, not as a
 * JS Date. node-postgres' default turns a DATE into a Date at LOCAL
 * midnight, which disagreed with every table type above (`string`) and
 * every contract (`z.string()`): reading any document with a date set —
 * a purchase invoice's invoice date, a journal entry's entry date — failed
 * the response schema with a 500, and dates near midnight could shift a
 * day when re-serialised in UTC. Found 2026-10-08 (journal entries list).
 * Only DATE (OID 1082) changes; TIMESTAMPTZ stays a Date.
 */
const TENANT_PG_TYPES: CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === types.builtins.DATE ? (value: string) => value : types.getTypeParser(oid, format)) as CustomTypesConfig['getTypeParser'],
};

export function createTenantKyselyClient(
  connectionString: string,
  schemaName: string,
): Kysely<TenantDatabase> {
  assertValidSchemaName(schemaName);

  return new Kysely<TenantDatabase>({
    dialect: new PostgresDialect({
      pool: new Pool({
        connectionString,
        options: `-c search_path="${schemaName}"`,
        types: TENANT_PG_TYPES,
      }),
    }),
  });
}

export interface ChartOfAccountsTable {
  id: string;
  code: string;
  name: string;
  account_type: string;
  normal_balance: string;
  parent_id: string | null;
  is_group: boolean;
  is_system: boolean;
  /** DB DEFAULT TRUE (migration 0048) — create() intentionally omits it. */
  is_active: Generated<boolean>;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface FiscalYearsTable {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  /** DB DEFAULT 'open' (migration 0049) — create() intentionally omits it. */
  status: Generated<string>;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface AccountingPeriodsTable {
  id: string;
  fiscal_year_id: string;
  name: string;
  start_date: string;
  end_date: string;
  /** DB DEFAULT 'open' (migration 0049) — create() intentionally omits it. */
  status: Generated<string>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntriesTable {
  id: string;
  entry_number: string;
  entry_date: string;
  currency: string;
  /** DB DEFAULT 'draft' (migration 0050) — create() intentionally omits it. */
  status: Generated<string>;
  source: string;
  description: string | null;
  reversal_of_entry_id: string | null;
  posted_at: Date | null;
  notes: string | null;
  custom_fields: unknown;
  /** Set only on auto-generated entries (source = 'auto') — see migration 0051. */
  source_reference_type: string | null;
  source_reference_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface JournalEntryLinesTable {
  id: string;
  journal_entry_id: string;
  account_id: string;
  debit_amount: string;
  credit_amount: string;
  description: string | null;
  line_order: number;
  cost_center_id: string | null;
  /** DB DEFAULT FALSE (migration 0057) — createMany() intentionally omits it. */
  is_reconciled: Generated<boolean>;
  reconciled_at: Date | null;
  created_at: Generated<Date>;
}

export interface AccountingSettingsTable {
  id: string;
  singleton: boolean;
  accounts_receivable_account_id: string | null;
  inventory_account_id: string | null;
  cogs_account_id: string | null;
  sales_returns_contra_account_id: string | null;
  revenue_account_id: string | null;
  accounts_payable_account_id: string | null;
  purchase_expense_account_id: string | null;
  /** Migration 0061 — POS feature Stage 1 (claude/sales-pos-research.md). */
  cash_account_id: string | null;
  /** Migration 0061 — POS feature Stage 1. Never auto-populated, same reasoning as purchase_expense_account_id. */
  cash_over_short_account_id: string | null;
  /** Migration 0073 — multi-currency Phase 1 (claude/multi-currency-strategy.md). Never auto-populated, same reasoning as purchase_expense_account_id; unused until Phase 4 wires realized gain/loss posting. */
  exchange_gain_loss_account_id: string | null;
  /** Migration 0084 — inventory value postings. */
  grni_account_id: string | null;
  inventory_adjustment_account_id: string | null;
  opening_balance_equity_account_id: string | null;
  landed_cost_clearing_account_id: string | null;
  /** Migration 0089 — non-cash receipts/payments without a chosen bank account. */
  default_bank_account_id: string | null;
  /** Migration 0091 — invoice tax postings. */
  vat_output_account_id: string | null;
  vat_input_account_id: string | null;
  table_tax_output_account_id: string | null;
  table_tax_input_account_id: string | null;
  withholding_payable_account_id: string | null;
  withholding_receivable_account_id: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/**
 * exchange_rates (migration 0072 — multi-currency Phase 1, see
 * claude/multi-currency-strategy.md). Append-only quote ledger — see
 * that migration's comment for why there's no update/delete.
 */
export interface ExchangeRatesTable {
  id: string;
  from_currency: string;
  to_currency: string;
  rate: string;
  rate_date: string;
  source: string;
  created_at: Generated<Date>;
}

export interface PosSessionsTable {
  id: string;
  cashier_user_id: string;
  status: string;
  opening_cash_amount: string;
  currency: string;
  /** Migration 0064 — POS feature Stage 3. Resolved once per session, at open time (see that migration's comment). */
  warehouse_id: string | null;
  expected_cash_amount: string | null;
  counted_cash_amount: string | null;
  variance_amount: string | null;
  notes: string | null;
  opened_at: Generated<Date>;
  closed_at: Date | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
  /** Migration 0095 — the cash box the session's cash goes into. */
  treasury_id: string | null;
}

export interface CostCentersTable {
  id: string;
  code: string;
  name: string;
  /** DB DEFAULT TRUE (migration 0055) — create() intentionally omits it. */
  is_active: Generated<boolean>;
  notes: string | null;
  custom_fields: unknown;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

/** Migration 0095: the former bank_accounts — every place money sits (cash box, bank, e-wallet). */
export interface TreasuriesTable {
  id: string;
  code: string;
  name: string;
  kind: Generated<string>;
  bank_name: string | null;
  account_number: string | null;
  iban: string | null;
  currency: string;
  /** Optional link to the chart of accounts (Accounting on); null → cash / default bank mapping. */
  chart_of_account_id: string | null;
  opening_balance_amount: Generated<string>;
  opening_balance_date: string | null;
  /** DB DEFAULT TRUE (migration 0058) — create() intentionally omits it. */
  is_active: Generated<boolean>;
  is_default: Generated<boolean>;
  notes: string | null;
  custom_fields: Generated<unknown>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TreasuryCategoriesTable {
  id: string;
  kind: string;
  name: string;
  chart_of_account_id: string | null;
  is_active: Generated<boolean>;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}

export interface TreasuryVouchersTable {
  id: string;
  voucher_number: string;
  kind: string;
  status: Generated<string>;
  voucher_date: string;
  treasury_id: string;
  to_treasury_id: string | null;
  category_id: string | null;
  amount: string;
  currency: string;
  counterparty: string | null;
  description: string | null;
  reference: string | null;
  created_by_user_id: string | null;
  cancelled_at: Date | null;
  cancel_reason: string | null;
  created_at: Generated<Date>;
  updated_at: Generated<Date>;
}


/** Migration 0069 — Layer 2 of claude/platform-flexibility-strategy.md
 * (tenant self-service module toggles, on top of Layer 1's Plan/
 * PlanFeature ceiling in the public schema). No row for a key means
 * "enabled" — see that migration's own comment. */
export interface TenantFeatureTogglesTable {
  feature_key: string;
  enabled: boolean;
  updated_at: Generated<Date>;
}
