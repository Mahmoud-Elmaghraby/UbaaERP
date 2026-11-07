import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type {
  PurchaseAnalysisQueryDto,
  PurchaseAnalysisReportDto,
  PurchasePriceEntryDto,
  PurchasePriceHistoryDto,
  PurchasePriceHistoryQueryDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { localIsoDate } from '../../../../shared/time/local-date';
import { proportionalShare } from '../../../../shared/reporting/fixed-point';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { aggregatePurchaseAnalysis, type PurchaseFact } from '../../domain/purchase-analysis';

/**
 * Purchase analysis and price history — read-only reports over Purchases documents.
 *
 * Analysis (company currency; documents in another currency are counted in
 * excludedForeignCurrencyDocuments and left out):
 *  - posted purchase invoice lines, before tax (net_amount, or unit price × quantity on lines
 *    older than migration 0092), dated by the invoice date (else its creation day);
 *  - minus debit-note lines (returns of invoiced goods), dated by the debit note.
 * Drafts and cancelled invoices never count.
 *
 * Price history: the item's posted invoice lines, newest first, price per base unit.
 */
@Injectable()
export class PurchaseAnalysisService {
  constructor(private readonly tenantSettings: TenantSettingsService) {}

  async report(db: Kysely<TenantDatabase>, query: PurchaseAnalysisQueryDto): Promise<PurchaseAnalysisReportDto> {
    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const fromDate = query.fromDate ?? null;
    const toDate = query.toDate ?? null;
    const supplierId = query.supplierId ?? null;
    const foreign = new Set<string>();
    const facts: PurchaseFact[] = [];

    const invoiceLines = (
      await sql<{
        document_id: string;
        doc_date: string;
        supplier_id: string;
        supplier_name: string;
        product_variant_id: string;
        product_name: string;
        sku: string | null;
        category_id: string | null;
        category_name: string | null;
        base_quantity: string;
        quantity: string;
        unit_price_amount: string;
        currency: string;
        net_amount: string | null;
      }>`
        SELECT pi.id AS document_id,
               to_char(COALESCE(pi.invoice_date::date, pi.created_at::date), 'YYYY-MM-DD') AS doc_date,
               po.supplier_id, s.name AS supplier_name,
               l.product_variant_id, p.name AS product_name, v.sku, p.category_id, c.name AS category_name,
               (l.quantity_invoiced * l.unit_factor)::text AS base_quantity, l.quantity_invoiced::text AS quantity,
               l.unit_price_amount::text AS unit_price_amount, l.unit_price_currency AS currency,
               l.net_amount::text AS net_amount
          FROM purchase_invoice_lines l
          JOIN purchase_invoices pi ON pi.id = l.purchase_invoice_id
          JOIN purchase_orders po ON po.id = pi.purchase_order_id
          JOIN suppliers s ON s.id = po.supplier_id
          JOIN product_variants v ON v.id = l.product_variant_id
          JOIN products p ON p.id = v.product_id
          LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE pi.status = 'posted'
           AND (${fromDate}::date IS NULL OR COALESCE(pi.invoice_date::date, pi.created_at::date) >= ${fromDate}::date)
           AND (${toDate}::date IS NULL OR COALESCE(pi.invoice_date::date, pi.created_at::date) <= ${toDate}::date)
           AND (${supplierId}::uuid IS NULL OR po.supplier_id = ${supplierId}::uuid)
      `.execute(db)
    ).rows;
    for (const line of invoiceLines) {
      if (line.currency !== currency) {
        foreign.add(`i:${line.document_id}`);
        continue;
      }
      facts.push({
        kind: 'invoice',
        documentId: line.document_id,
        date: line.doc_date,
        supplierId: line.supplier_id,
        supplierName: line.supplier_name,
        productVariantId: line.product_variant_id,
        productName: line.product_name,
        sku: line.sku,
        categoryId: line.category_id,
        categoryName: line.category_name,
        quantity: line.base_quantity,
        netMinor: lineNet(line.net_amount, line.unit_price_amount, line.quantity),
      });
    }

    const debitLines = (
      await sql<{
        document_id: string;
        doc_date: string;
        supplier_id: string;
        supplier_name: string;
        product_variant_id: string;
        product_name: string;
        sku: string | null;
        category_id: string | null;
        category_name: string | null;
        base_quantity: string;
        currency: string;
        net_amount: string;
      }>`
        SELECT dn.id AS document_id, to_char(dn.debit_note_date::date, 'YYYY-MM-DD') AS doc_date,
               dn.supplier_id, s.name AS supplier_name,
               l.product_variant_id, p.name AS product_name, v.sku, p.category_id, c.name AS category_name,
               l.base_quantity::text AS base_quantity, dn.currency, l.net_amount::text AS net_amount
          FROM purchase_debit_note_lines l
          JOIN purchase_debit_notes dn ON dn.id = l.purchase_debit_note_id
          JOIN suppliers s ON s.id = dn.supplier_id
          JOIN product_variants v ON v.id = l.product_variant_id
          JOIN products p ON p.id = v.product_id
          LEFT JOIN product_categories c ON c.id = p.category_id
         WHERE (${fromDate}::date IS NULL OR dn.debit_note_date::date >= ${fromDate}::date)
           AND (${toDate}::date IS NULL OR dn.debit_note_date::date <= ${toDate}::date)
           AND (${supplierId}::uuid IS NULL OR dn.supplier_id = ${supplierId}::uuid)
      `.execute(db)
    ).rows;
    for (const line of debitLines) {
      if (line.currency !== currency) {
        foreign.add(`d:${line.document_id}`);
        continue;
      }
      facts.push({
        kind: 'debit_note',
        documentId: line.document_id,
        date: line.doc_date,
        supplierId: line.supplier_id,
        supplierName: line.supplier_name,
        productVariantId: line.product_variant_id,
        productName: line.product_name,
        sku: line.sku,
        categoryId: line.category_id,
        categoryName: line.category_name,
        quantity: line.base_quantity,
        netMinor: BigInt(line.net_amount),
      });
    }

    const { rows, totals } = aggregatePurchaseAnalysis(facts, query.groupBy);
    return {
      groupBy: query.groupBy,
      fromDate,
      toDate: toDate ?? (fromDate ? localIsoDate() : null),
      currency,
      rows: rows.map((row) => ({
        key: row.key,
        label: row.label,
        secondaryLabel: row.secondaryLabel,
        quantity: row.quantity,
        grossPurchasesMinorUnits: row.grossMinor.toString(),
        returnsMinorUnits: row.returnsMinor.toString(),
        netPurchasesMinorUnits: row.netMinor.toString(),
        averageUnitCostMinorUnits: row.averageUnitCostMinor === null ? null : row.averageUnitCostMinor.toString(),
        sharePercent: row.sharePercent,
        invoiceCount: row.invoiceCount,
      })),
      totals: {
        grossPurchasesMinorUnits: totals.grossMinor.toString(),
        returnsMinorUnits: totals.returnsMinor.toString(),
        netPurchasesMinorUnits: totals.netMinor.toString(),
        invoiceCount: totals.invoiceCount,
      },
      excludedForeignCurrencyDocuments: foreign.size,
    };
  }

  async priceHistory(db: Kysely<TenantDatabase>, query: PurchasePriceHistoryQueryDto): Promise<PurchasePriceHistoryDto> {
    const entries = await this.priceEntries(db, query.productVariantId, null, query.limit);
    let lastFromSupplier: PurchasePriceEntryDto | null = null;
    if (query.supplierId) {
      lastFromSupplier =
        entries.find((entry) => entry.supplierId === query.supplierId) ??
        (await this.priceEntries(db, query.productVariantId, query.supplierId, 1))[0] ??
        null;
    }
    return { productVariantId: query.productVariantId, entries, lastFromSupplier };
  }

  private async priceEntries(
    db: Kysely<TenantDatabase>,
    productVariantId: string,
    supplierId: string | null,
    limit: number,
  ): Promise<PurchasePriceEntryDto[]> {
    const rows = (
      await sql<PurchaseEntryRow>`
        SELECT pi.id AS purchase_invoice_id, pi.invoice_number,
               to_char(COALESCE(pi.invoice_date::date, pi.created_at::date), 'YYYY-MM-DD') AS doc_date,
               po.supplier_id, s.name AS supplier_name,
               (l.quantity_invoiced * l.unit_factor)::text AS base_quantity, l.quantity_invoiced::text AS quantity,
               l.unit_price_amount::text AS unit_price_amount, l.unit_price_currency AS currency,
               l.net_amount::text AS net_amount
          FROM purchase_invoice_lines l
          JOIN purchase_invoices pi ON pi.id = l.purchase_invoice_id
          JOIN purchase_orders po ON po.id = pi.purchase_order_id
          JOIN suppliers s ON s.id = po.supplier_id
         WHERE pi.status = 'posted' AND l.product_variant_id = ${productVariantId}::uuid
           AND (${supplierId}::uuid IS NULL OR po.supplier_id = ${supplierId}::uuid)
         ORDER BY COALESCE(pi.invoice_date::date, pi.created_at::date) DESC, pi.created_at DESC
         LIMIT ${limit}
      `.execute(db)
    ).rows;
    return rows.map((row) => ({
      purchaseInvoiceId: row.purchase_invoice_id,
      invoiceNumber: row.invoice_number,
      date: row.doc_date,
      supplierId: row.supplier_id,
      supplierName: row.supplier_name,
      // Net of the line's discount, per base unit.
      unitPriceMinorUnits: proportionalShare(lineNet(row.net_amount, row.unit_price_amount, row.quantity), 1, row.base_quantity).toString(),
      currency: row.currency,
      quantity: Number(row.base_quantity),
    }));
  }
}

interface PurchaseEntryRow {
  purchase_invoice_id: string;
  invoice_number: string;
  doc_date: string;
  supplier_id: string;
  supplier_name: string;
  base_quantity: string;
  quantity: string;
  unit_price_amount: string;
  currency: string;
  net_amount: string | null;
}

/** A line's amount before tax: the stored net, or unit price × quantity on older lines. */
function lineNet(netAmount: string | null, unitPriceAmount: string, quantity: string): bigint {
  if (netAmount !== null) return BigInt(netAmount);
  return proportionalShare(BigInt(unitPriceAmount), quantity, 1);
}
