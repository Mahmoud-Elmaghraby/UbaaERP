import { ConflictError, NotFoundError } from './domain-errors';

/**
 * Centralizes the two error shapes that repeat, nearly verbatim, at 150+
 * call sites across every module: "an entity with this id doesn't exist"
 * and "an entity with this unique field already exists". Both still get a
 * real, stable `code` (looked up in error-messages.ar.ts) and keep an
 * English `message` for logs — call sites just stop hand-writing both.
 *
 * A BusinessRuleError is NOT covered here: those are one-off business
 * rules and each gets its own explicit `code` where it is thrown.
 *
 * Adding a new entity: add one line to ENTITY_LABELS, then a
 * '<ENTITY>.NOT_FOUND' (and '<ENTITY>.DUPLICATE_<FIELD>' if needed) line
 * to error-messages.ar.ts. Never rename an existing key — a `code` is
 * part of the API contract once shipped (see domain-errors.ts).
 */
export const ENTITY_LABELS = {
  BRANCH: 'Branch',
  WAREHOUSE: 'Warehouse',
  WAREHOUSE_LOCATION: 'Warehouse location',
  PRODUCT: 'Product',
  PRODUCT_VARIANT: 'Product variant',
  UNIT_OF_MEASURE: 'Unit of measure',
  STOCK_LEVEL: 'Stock level',
  STOCK_MOVEMENT: 'Stock movement',
  LANDED_COST: 'Landed cost',
  FISCAL_YEAR: 'Fiscal year',
  CHART_OF_ACCOUNT: 'Chart of accounts entry',
  BANK_ACCOUNT: 'Bank account',
  JOURNAL_ENTRY: 'Journal entry',
  JOURNAL_ENTRY_LINE: 'Journal entry line',
  COST_CENTER: 'Cost center',
  EXCHANGE_RATE: 'Exchange rate',
  ACCOUNTING_PERIOD: 'Accounting period',
  PURCHASE_REQUISITION: 'Purchase requisition',
  PURCHASE_ORDER: 'Purchase order',
  PURCHASE_INVOICE: 'Purchase invoice',
  SUPPLIER_QUOTATION: 'Supplier quotation',
  RFQ: 'RFQ',
  SUPPLIER: 'Supplier',
  GOODS_RECEIPT: 'Goods receipt',
  PURCHASE_RETURN: 'Purchase return',
  SALES_ORDER: 'Sales order',
  SALES_INVOICE: 'Sales invoice',
  SALES_RETURN: 'Sales return',
  SALES_CREDIT_NOTE: 'Sales credit note',
  QUOTATION: 'Quotation',
  CUSTOMER: 'Customer',
  DELIVERY: 'Delivery',
  PAYMENT: 'Payment',
  POS_SESSION: 'POS session',
  CUSTOM_FIELD_DEFINITION: 'Custom field definition',
  NUMBERING_SEQUENCE: 'Numbering sequence',
  DOCUMENT_TEMPLATE: 'Document template',
  TAX_RULE: 'Tax rule',
  USER: 'User',
  ROLE: 'Role',
  ATTACHMENT: 'Attachment',
} as const;

export type EntityKey = keyof typeof ENTITY_LABELS;

/**
 * Note: this deliberately flattens minor English-wording variants that
 * existed before (e.g. "Parent account "x" not found." and "Chart of
 * accounts entry "x" not found." both become the CHART_OF_ACCOUNT
 * message) — `message` is now log-only, and the single Arabic message per
 * entity already reads correctly for both cases.
 */
/**
 * `id` accepts `undefined`/`null` for the same reason `duplicateEntity`'s
 * `value` does below: a caller is often referencing an *optional* input
 * field (e.g. an UpdateXInput's foreign key) even though a real
 * not-found here always means something was actually provided. Harmless
 * either way — NOT_FOUND messages never interpolate the id (see file
 * header): a missing id just becomes an empty `""` in the log-only
 * English `message`.
 */
export function entityNotFound(entity: EntityKey, id: string | null | undefined): NotFoundError {
  const shown = id ?? '';
  return new NotFoundError(`${ENTITY_LABELS[entity]} "${shown}" not found.`, {
    code: `${entity}.NOT_FOUND`,
    params: { id: shown },
  });
}

/**
 * `field` becomes part of the `code` (e.g. BRANCH.DUPLICATE_CODE) — add
 * the matching AR_MESSAGES entry when introducing a new (entity, field)
 * pair. For a conflict that isn't a simple single-field duplicate (a
 * composite key, or bespoke business wording), throw a ConflictError with
 * an explicit code directly instead of forcing it through this helper.
 *
 * `value` accepts `undefined` because an *update* input's field is
 * typically optional (a partial patch) even though a real unique-violation
 * here always means it was actually provided — same as the pre-i18n code,
 * which just interpolated the value into a template string either way.
 */
export function duplicateEntity(
  entity: EntityKey,
  field: string,
  value: string | number | undefined,
): ConflictError {
  const shown = value ?? '';
  return new ConflictError(
    `A ${ENTITY_LABELS[entity].toLowerCase()} with ${field} "${shown}" already exists.`,
    { code: `${entity}.DUPLICATE_${field.toUpperCase()}`, params: { value: shown } },
  );
}
