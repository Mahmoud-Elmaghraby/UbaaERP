import { sql, type Kysely } from 'kysely';
import type { TenantDatabase } from '../../database/tenant/kysely-client';

export interface TaxReportRow {
  /** output = on sales (net of credit notes), input = on purchases. */
  direction: 'output' | 'input';
  kind: 'vat' | 'table' | 'withholding';
  taxRuleId: string;
  name: string;
  rate: string;
  etaType: string | null;
  etaSubtype: string | null;
  currency: string;
  /** Minor units; credit notes are subtracted from sales. */
  baseMinorUnits: string;
  amountMinorUnits: string;
  documentCount: number;
}

/**
 * Read-only: the taxes on posted invoices and issued credit notes in a date
 * range, grouped by rule — straight from each line's stored tax snapshot
 * (migration 0092), so the report is exactly what was invoiced and posted.
 * Documents are dated by their invoice date (else the day they were created).
 */
export async function readTaxReport(
  db: Kysely<TenantDatabase>,
  range: { from: string; to: string },
): Promise<TaxReportRow[]> {
  const result = await sql<{
    direction: 'output' | 'input';
    kind: 'vat' | 'table' | 'withholding';
    tax_rule_id: string;
    name: string;
    rate: string;
    eta_type: string | null;
    eta_subtype: string | null;
    currency: string;
    base: string;
    amount: string;
    documents: string;
  }>`
    WITH taxed AS (
      SELECT 'output' AS direction, 1 AS sign, i.id AS document_id, l.unit_price_currency AS currency, t.tax
        FROM sales_invoices i
        JOIN sales_invoice_lines l ON l.sales_invoice_id = i.id
        CROSS JOIN LATERAL jsonb_array_elements(l.taxes) AS t(tax)
       WHERE i.status = 'posted'
         AND COALESCE(i.invoice_date, i.created_at::date) BETWEEN ${range.from}::date AND ${range.to}::date
      UNION ALL
      SELECT 'output', -1, c.id, l.unit_price_currency, t.tax
        FROM sales_credit_notes c
        JOIN sales_credit_note_lines l ON l.sales_credit_note_id = c.id
        CROSS JOIN LATERAL jsonb_array_elements(l.taxes) AS t(tax)
       WHERE c.created_at::date BETWEEN ${range.from}::date AND ${range.to}::date
      UNION ALL
      SELECT 'input', 1, i.id, l.unit_price_currency, t.tax
        FROM purchase_invoices i
        JOIN purchase_invoice_lines l ON l.purchase_invoice_id = i.id
        CROSS JOIN LATERAL jsonb_array_elements(l.taxes) AS t(tax)
       WHERE i.status = 'posted'
         AND COALESCE(i.invoice_date, i.created_at::date) BETWEEN ${range.from}::date AND ${range.to}::date
    )
    SELECT direction,
           tax->>'kind' AS kind,
           tax->>'taxRuleId' AS tax_rule_id,
           MAX(tax->>'name') AS name,
           tax->>'rate' AS rate,
           MAX(tax->>'etaType') AS eta_type,
           MAX(tax->>'etaSubtype') AS eta_subtype,
           currency,
           SUM(sign * (tax->>'baseMinorUnits')::numeric) AS base,
           SUM(sign * (tax->>'amountMinorUnits')::numeric) AS amount,
           COUNT(DISTINCT document_id) AS documents
      FROM taxed
     GROUP BY direction, tax->>'kind', tax->>'taxRuleId', tax->>'rate', currency
     ORDER BY direction DESC, kind, rate DESC
  `.execute(db);
  return result.rows.map((row) => ({
    direction: row.direction,
    kind: row.kind,
    taxRuleId: row.tax_rule_id,
    name: row.name,
    rate: row.rate,
    etaType: row.eta_type,
    etaSubtype: row.eta_subtype,
    currency: row.currency,
    baseMinorUnits: String(row.base),
    amountMinorUnits: String(row.amount),
    documentCount: Number(row.documents),
  }));
}
