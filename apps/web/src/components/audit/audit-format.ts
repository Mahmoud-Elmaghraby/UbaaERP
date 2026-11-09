import type { TFunction } from 'i18next';

/** The audit-log module filter: which entity types belong to which module. */
export const AUDIT_MODULES: Record<string, string[]> = {
  sales: [
    'customer', 'quotation', 'sales_order', 'delivery', 'sales_invoice', 'payment_received', 'sales_return',
    'sales_credit_note', 'pos_session', 'channel_settlement', 'price_list',
  ],
  purchases: [
    'supplier', 'purchase_requisition', 'rfq', 'purchase_order', 'goods_receipt', 'purchase_return',
    'purchase_debit_note', 'purchase_invoice', 'supplier_payment', 'cheque',
  ],
  inventory: [
    'product', 'product_variant', 'warehouse', 'stock_count', 'stock_transfer', 'stock_adjustment', 'landed_cost',
    'stock_movement', 'stock_consumption', 'stock_restoration', 'unit_of_measure',
  ],
  accounting: ['journal_entry', 'account', 'bank_account', 'recurring_entry', 'fixed_asset', 'budget', 'fiscal_period'],
  settings: [
    'tenant_settings', 'branch', 'currency', 'custom_field', 'document_template', 'feature_toggle',
    'numbering_sequence', 'tax_rule', 'inventory_settings', 'accounting_settings', 'app_setting',
  ],
  users: ['user', 'role', 'auth'],
};

/** "فاتورة مبيعات" for 'sales_invoice'; the raw type when there's no label yet. */
export function auditEntityLabel(t: TFunction, entityType: string): string {
  return t(`audit.entities.${entityType}`, { defaultValue: entityType });
}

/**
 * The action in words. Business events store the plain verb ('posted'); account events are
 * qualified ('user.password_set', 'auth.login'); older inventory rows are 'inventory.<entity>.<verb>'.
 */
export function auditActionLabel(t: TFunction, action: string): string {
  const qualified = t(`audit.events.${action.replace(/\./g, '_')}`, { defaultValue: '' });
  if (qualified) return qualified;
  const verb = action.slice(action.lastIndexOf('.') + 1);
  return t(`history.actions.${verb}`, { defaultValue: verb });
}
