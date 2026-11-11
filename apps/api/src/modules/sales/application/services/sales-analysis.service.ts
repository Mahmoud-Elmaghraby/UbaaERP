import { Injectable } from '@nestjs/common';
import { sql, type Kysely } from 'kysely';
import type { SalesAnalysisQueryDto, SalesAnalysisReportDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { localIsoDate } from '../../../../shared/time/local-date';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import {
  aggregateSalesAnalysis,
  costOfQuantity,
  proportionalShare,
  type SalesFact,
} from '../../domain/sales-analysis';

/**
 * Sales analysis report: net sales, cost of goods sold, gross profit and
 * margin grouped by rep / item / customer / month. Read-only.
 *
 * Sources (posted invoices only; cancelled and drafts never count):
 *  - Net sales: each posted invoice line's amount before tax (net_amount,
 *    or unit price × quantity on lines older than migration 0092), minus
 *    each credit-note line's amount before tax. Credit notes have no
 *    draft/cancelled state (issued when the return is confirmed) and are
 *    dated by their creation day.
 *  - Cost of goods sold: what the stock actually lost, read from
 *    Inventory's stock_movements (read-only — no Inventory service is
 *    called). A confirmed delivery records 'out' movements with reference
 *    ('delivery', delivery id) carrying the exact value that left stock
 *    (total_cost_amount; older rows: quantity × unit/average cost, the same
 *    expression Inventory's valuation report uses). Movements are per item,
 *    not per delivery line, so each delivery line takes its quantity's share;
 *    a sales order line's average delivered cost is then applied to the
 *    quantity each invoice line bills against that order line.
 *    Approximations, by design:
 *     · invoiced but not (yet) delivered/costed quantity is costed at the
 *       item's latest running average cost (its last stock movement);
 *     · later cost corrections (landed costs, purchase cost corrections)
 *       that were expensed straight to COGS are not re-attributed here;
 *     · a credit note reverses the cost its return put back into stock
 *       (the 'in' movements of ('sales_return', return id)).
 *  - Rep of a credit note: the rep of the first posted invoice of the same
 *    sales order (credit notes are per order, not per invoice), else the
 *    order's own rep.
 *
 * Figures are in the company currency; documents in another currency are
 * counted in excludedForeignCurrencyDocuments and left out (stock cost is
 * kept in the company currency only).
 */
@Injectable()
export class SalesAnalysisService {
  constructor(private readonly tenantSettings: TenantSettingsService) {}

  async report(db: Kysely<TenantDatabase>, query: SalesAnalysisQueryDto): Promise<SalesAnalysisReportDto> {
    const currency = (await this.tenantSettings.get(db)).currencyCode;
    const fromDate = query.fromDate ?? null;
    const toDate = query.toDate ?? null;
    const repId = query.salesRepId ?? null;
    const customerId = query.customerId ?? null;
    const channelId = query.salesChannelId ?? null;
    const facts: SalesFact[] = [];
    const foreignDocuments = new Set<string>();

    // ---- Invoice lines -------------------------------------------------
    const invoiceLines = (
      await sql<{
        sales_invoice_id: string;
        sales_order_line_id: string;
        product_variant_id: string;
        base_quantity: string;
        unit_price_amount: string;
        unit_price_currency: string;
        quantity_invoiced: string;
        net_amount: string | null;
        doc_date: string;
        customer_id: string;
        customer_name: string;
        sales_rep_id: string | null;
        sales_rep_name: string | null;
        product_name: string;
        sku: string | null;
        product_id: string;
        product_code: string;
        category_id: string | null;
        category_name: string | null;
        attribute_values: Record<string, unknown> | null;
        cashier_id: string | null;
        cashier_name: string | null;
        channel_id: string | null;
        channel_name: string | null;
      }>`
        SELECT l.sales_invoice_id, l.sales_order_line_id, l.product_variant_id,
               (l.quantity_invoiced * l.unit_factor)::text AS base_quantity,
               l.unit_price_amount::text AS unit_price_amount, l.unit_price_currency,
               l.quantity_invoiced::text AS quantity_invoiced, l.net_amount::text AS net_amount,
               to_char(COALESCE(si.invoice_date::date, si.created_at::date), 'YYYY-MM-DD') AS doc_date,
               so.customer_id, c.name AS customer_name,
               si.sales_rep_id, r.name AS sales_rep_name,
               p.name AS product_name, v.sku,
               p.id AS product_id, p.code AS product_code, p.category_id, pc.name AS category_name, v.attribute_values,
               ps.cashier_user_id AS cashier_id, u.full_name AS cashier_name,
               si.sales_channel_id AS channel_id, sc.name AS channel_name
          FROM sales_invoice_lines l
          JOIN sales_invoices si ON si.id = l.sales_invoice_id
          JOIN sales_orders so ON so.id = si.sales_order_id
          JOIN customers c ON c.id = so.customer_id
          LEFT JOIN sales_reps r ON r.id = si.sales_rep_id
          JOIN product_variants v ON v.id = l.product_variant_id
          JOIN products p ON p.id = v.product_id
          LEFT JOIN product_categories pc ON pc.id = p.category_id
          LEFT JOIN pos_sessions ps ON ps.id = so.pos_session_id
          LEFT JOIN users u ON u.id = ps.cashier_user_id
          LEFT JOIN sales_channels sc ON sc.id = si.sales_channel_id
         WHERE si.status = 'posted'
           AND (${channelId}::uuid IS NULL OR si.sales_channel_id = ${channelId}::uuid)
           AND (${fromDate}::date IS NULL OR COALESCE(si.invoice_date::date, si.created_at::date) >= ${fromDate}::date)
           AND (${toDate}::date IS NULL OR COALESCE(si.invoice_date::date, si.created_at::date) <= ${toDate}::date)
           AND (${repId}::uuid IS NULL OR si.sales_rep_id = ${repId}::uuid)
           AND (${customerId}::uuid IS NULL OR so.customer_id = ${customerId}::uuid)
      `.execute(db)
    ).rows;

    const ownCurrencyInvoiceLines = invoiceLines.filter((line) => {
      if (line.unit_price_currency === currency) return true;
      foreignDocuments.add(`i:${line.sales_invoice_id}`);
      return false;
    });

    const orderLineIds = [...new Set(ownCurrencyInvoiceLines.map((l) => l.sales_order_line_id))];
    const deliveredByOrderLine = new Map<string, { lineQuantity: string; movedQuantity: string; movedCostMinor: bigint }[]>();
    if (orderLineIds.length > 0) {
      const delivered = (
        await sql<{ sales_order_line_id: string; line_quantity: string; moved_quantity: string; moved_cost: string }>`
          WITH dl AS (
            SELECT dl.sales_order_line_id, dl.delivery_id, dl.product_variant_id,
                   dl.quantity_delivered * dl.unit_factor AS line_quantity
              FROM delivery_lines dl
              JOIN deliveries d ON d.id = dl.delivery_id
             WHERE d.status = 'confirmed' AND dl.sales_order_line_id = ANY(${orderLineIds}::uuid[])
          ), moved AS (
            SELECT m.reference_id AS delivery_id, m.product_variant_id,
                   SUM(m.quantity) AS quantity,
                   SUM(COALESCE(m.total_cost_amount, ROUND(m.quantity * COALESCE(m.unit_cost_amount, m.resulting_average_cost_amount)))) AS cost
              FROM stock_movements m
             WHERE m.reference_type = 'delivery' AND m.movement_type = 'out'
               AND m.reference_id IN (SELECT delivery_id FROM dl)
             GROUP BY m.reference_id, m.product_variant_id
          )
          SELECT dl.sales_order_line_id, dl.line_quantity::text AS line_quantity,
                 moved.quantity::text AS moved_quantity, ROUND(moved.cost)::bigint::text AS moved_cost
            FROM dl
            JOIN moved ON moved.delivery_id = dl.delivery_id AND moved.product_variant_id = dl.product_variant_id
        `.execute(db)
      ).rows;
      for (const row of delivered) {
        const list = deliveredByOrderLine.get(row.sales_order_line_id) ?? [];
        list.push({ lineQuantity: row.line_quantity, movedQuantity: row.moved_quantity, movedCostMinor: BigInt(row.moved_cost) });
        deliveredByOrderLine.set(row.sales_order_line_id, list);
      }
    }
    const fallbackCost = await this.latestAverageCosts(
      db,
      [...new Set(ownCurrencyInvoiceLines.filter((l) => !deliveredByOrderLine.has(l.sales_order_line_id)).map((l) => l.product_variant_id))],
    );

    for (const line of ownCurrencyInvoiceLines) {
      facts.push({
        kind: 'invoice',
        documentId: line.sales_invoice_id,
        date: line.doc_date,
        customerId: line.customer_id,
        customerName: line.customer_name,
        salesRepId: line.sales_rep_id,
        salesRepName: line.sales_rep_name,
        productVariantId: line.product_variant_id,
        productName: line.product_name,
        sku: line.sku,
        ...describe(line),
        quantity: Number(line.base_quantity),
        netMinor: lineNet(line.net_amount, line.unit_price_amount, line.quantity_invoiced),
        costMinor: costOfQuantity(
          line.base_quantity,
          deliveredByOrderLine.get(line.sales_order_line_id) ?? [],
          fallbackCost.get(line.product_variant_id) ?? 0n,
        ),
      });
    }

    // ---- Credit-note lines ----------------------------------------------
    const creditLines = (
      await sql<{
        sales_credit_note_id: string;
        sales_return_id: string;
        product_variant_id: string;
        base_quantity: string;
        return_line_quantity: string;
        unit_price_amount: string;
        quantity: string;
        net_amount: string | null;
        currency: string;
        doc_date: string;
        customer_id: string;
        customer_name: string;
        sales_rep_id: string | null;
        sales_rep_name: string | null;
        product_name: string;
        sku: string | null;
        product_id: string;
        product_code: string;
        category_id: string | null;
        category_name: string | null;
        attribute_values: Record<string, unknown> | null;
        cashier_id: string | null;
        cashier_name: string | null;
        channel_id: string | null;
        channel_name: string | null;
      }>`
        WITH notes AS (
          SELECT cn.id, cn.sales_return_id, cn.customer_id, cn.currency, cn.created_at::date AS doc_date,
                 COALESCE(
                   (SELECT si.sales_rep_id FROM sales_invoices si
                     WHERE si.sales_order_id = d.sales_order_id AND si.status = 'posted'
                     ORDER BY si.created_at LIMIT 1),
                   so.sales_rep_id
                 ) AS sales_rep_id,
                 (SELECT si.sales_channel_id FROM sales_invoices si
                   WHERE si.sales_order_id = d.sales_order_id AND si.status = 'posted'
                   ORDER BY si.created_at LIMIT 1) AS channel_id,
                 so.pos_session_id
            FROM sales_credit_notes cn
            JOIN sales_returns sr ON sr.id = cn.sales_return_id
            JOIN deliveries d ON d.id = sr.delivery_id
            JOIN sales_orders so ON so.id = d.sales_order_id
           WHERE (${fromDate}::date IS NULL OR cn.created_at::date >= ${fromDate}::date)
             AND (${toDate}::date IS NULL OR cn.created_at::date <= ${toDate}::date)
             AND (${customerId}::uuid IS NULL OR cn.customer_id = ${customerId}::uuid)
        )
        SELECT n.id AS sales_credit_note_id, n.sales_return_id, l.product_variant_id,
               (l.quantity * l.unit_factor)::text AS base_quantity,
               (rl.quantity_returned * rl.unit_factor)::text AS return_line_quantity,
               l.unit_price_amount::text AS unit_price_amount, l.quantity::text AS quantity, l.net_amount::text AS net_amount,
               n.currency, to_char(n.doc_date, 'YYYY-MM-DD') AS doc_date,
               n.customer_id, c.name AS customer_name, n.sales_rep_id, r.name AS sales_rep_name,
               p.name AS product_name, v.sku,
               p.id AS product_id, p.code AS product_code, p.category_id, pc.name AS category_name, v.attribute_values,
               ps.cashier_user_id AS cashier_id, u.full_name AS cashier_name,
               n.channel_id, sc.name AS channel_name
          FROM notes n
          JOIN sales_credit_note_lines l ON l.sales_credit_note_id = n.id
          JOIN sales_return_lines rl ON rl.id = l.sales_return_line_id
          JOIN customers c ON c.id = n.customer_id
          LEFT JOIN sales_reps r ON r.id = n.sales_rep_id
          JOIN product_variants v ON v.id = l.product_variant_id
          JOIN products p ON p.id = v.product_id
          LEFT JOIN product_categories pc ON pc.id = p.category_id
          LEFT JOIN pos_sessions ps ON ps.id = n.pos_session_id
          LEFT JOIN users u ON u.id = ps.cashier_user_id
          LEFT JOIN sales_channels sc ON sc.id = n.channel_id
         WHERE (${repId}::uuid IS NULL OR n.sales_rep_id = ${repId}::uuid)
           AND (${channelId}::uuid IS NULL OR n.channel_id = ${channelId}::uuid)
      `.execute(db)
    ).rows;

    const ownCurrencyCreditLines = creditLines.filter((line) => {
      if (line.currency === currency) return true;
      foreignDocuments.add(`c:${line.sales_credit_note_id}`);
      return false;
    });

    const returnIds = [...new Set(ownCurrencyCreditLines.map((l) => l.sales_return_id))];
    const returnedCost = new Map<string, { quantity: string; cost: bigint }>();
    if (returnIds.length > 0) {
      const rows = (
        await sql<{ sales_return_id: string; product_variant_id: string; quantity: string; cost: string }>`
          SELECT m.reference_id AS sales_return_id, m.product_variant_id, SUM(m.quantity)::text AS quantity,
                 ROUND(SUM(COALESCE(m.total_cost_amount, ROUND(m.quantity * COALESCE(m.unit_cost_amount, m.resulting_average_cost_amount)))))::bigint::text AS cost
            FROM stock_movements m
           WHERE m.reference_type = 'sales_return' AND m.movement_type = 'in'
             AND m.reference_id = ANY(${returnIds}::uuid[])
           GROUP BY m.reference_id, m.product_variant_id
        `.execute(db)
      ).rows;
      for (const row of rows) returnedCost.set(`${row.sales_return_id}:${row.product_variant_id}`, { quantity: row.quantity, cost: BigInt(row.cost) });
    }

    for (const line of ownCurrencyCreditLines) {
      const back = returnedCost.get(`${line.sales_return_id}:${line.product_variant_id}`);
      // The return line's share of what the return put back, scaled to the credited quantity.
      const returnLineCost = back ? proportionalShare(back.cost, line.return_line_quantity, back.quantity) : 0n;
      const cost = proportionalShare(returnLineCost, line.base_quantity, line.return_line_quantity);
      facts.push({
        kind: 'credit_note',
        documentId: line.sales_credit_note_id,
        date: line.doc_date,
        customerId: line.customer_id,
        customerName: line.customer_name,
        salesRepId: line.sales_rep_id,
        salesRepName: line.sales_rep_name,
        productVariantId: line.product_variant_id,
        productName: line.product_name,
        sku: line.sku,
        ...describe(line),
        quantity: -Number(line.base_quantity),
        netMinor: -lineNet(line.net_amount, line.unit_price_amount, line.quantity),
        costMinor: -cost,
      });
    }

    const { rows, totals } = aggregateSalesAnalysis(facts, query.groupBy, query.optionName);
    // By channel: the platform fees its posted settlements deducted in the period.
    const fees = query.groupBy === 'channel' ? await this.channelFees(db, fromDate, toDate, channelId, currency) : new Map<string, bigint>();
    const optionNames = [...new Set(facts.flatMap((f) => Object.keys(f.attributes ?? {})))].sort();
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
        netSalesMinorUnits: row.netSalesMinor.toString(),
        costOfGoodsSoldMinorUnits: row.costMinor.toString(),
        grossProfitMinorUnits: row.grossProfitMinor.toString(),
        marginPercent: row.marginPercent,
        invoiceCount: row.invoiceCount,
        feesMinorUnits: query.groupBy === 'channel' && row.key ? (fees.get(row.key) ?? 0n).toString() : null,
        netProfitMinorUnits: query.groupBy === 'channel' && row.key ? (row.grossProfitMinor - (fees.get(row.key) ?? 0n)).toString() : null,
      })),
      totals: {
        netSalesMinorUnits: totals.netSalesMinor.toString(),
        costOfGoodsSoldMinorUnits: totals.costMinor.toString(),
        grossProfitMinorUnits: totals.grossProfitMinor.toString(),
        marginPercent: totals.marginPercent,
        invoiceCount: totals.invoiceCount,
        feesMinorUnits: query.groupBy === 'channel' ? [...fees.values()].reduce((a, b) => a + b, 0n).toString() : null,
        netProfitMinorUnits:
          query.groupBy === 'channel' ? (totals.grossProfitMinor - [...fees.values()].reduce((a, b) => a + b, 0n)).toString() : null,
      },
      optionNames,
      excludedForeignCurrencyDocuments: foreignDocuments.size,
    };
  }

  /** Fee lines of posted channel settlements dated in the period, per channel (company currency). */
  private async channelFees(
    db: Kysely<TenantDatabase>,
    fromDate: string | null,
    toDate: string | null,
    channelId: string | null,
    currency: string,
  ): Promise<Map<string, bigint>> {
    const rows = (
      await sql<{ sales_channel_id: string; fees: string }>`
        SELECT s.sales_channel_id, SUM(l.amount)::bigint::text AS fees
          FROM channel_settlement_lines l
          JOIN channel_settlements s ON s.id = l.channel_settlement_id
         WHERE s.status = 'posted' AND l.kind = 'fee' AND s.currency = ${currency}
           AND (${fromDate}::date IS NULL OR s.statement_date >= ${fromDate}::date)
           AND (${toDate}::date IS NULL OR s.statement_date <= ${toDate}::date)
           AND (${channelId}::uuid IS NULL OR s.sales_channel_id = ${channelId}::uuid)
         GROUP BY s.sales_channel_id
      `.execute(db)
    ).rows;
    return new Map(rows.map((r) => [r.sales_channel_id, BigInt(r.fees)]));
  }

  /** Each item's running average cost after its latest stock movement (minor units). */
  private async latestAverageCosts(db: Kysely<TenantDatabase>, variantIds: string[]): Promise<Map<string, bigint>> {
    if (variantIds.length === 0) return new Map();
    const rows = (
      await sql<{ product_variant_id: string; cost: string }>`
        SELECT DISTINCT ON (m.product_variant_id) m.product_variant_id, ROUND(m.resulting_average_cost_amount)::bigint::text AS cost
          FROM stock_movements m
         WHERE m.product_variant_id = ANY(${variantIds}::uuid[])
         ORDER BY m.product_variant_id, m.created_at DESC
      `.execute(db)
    ).rows;
    return new Map(rows.map((r) => [r.product_variant_id, BigInt(r.cost)]));
  }
}

/** A line's amount before tax: the stored net, or unit price × quantity on older lines. */
function lineNet(netAmount: string | null, unitPriceAmount: string, quantity: string): bigint {
  if (netAmount !== null) return BigInt(netAmount);
  return proportionalShare(BigInt(unitPriceAmount), quantity, 1);
}

/** The descriptive fields every fact carries for the extra groupings. */
function describe(line: {
  product_id: string;
  product_code: string;
  category_id: string | null;
  category_name: string | null;
  attribute_values: Record<string, unknown> | null;
  cashier_id: string | null;
  cashier_name: string | null;
  channel_id: string | null;
  channel_name: string | null;
}) {
  return {
    productId: line.product_id,
    productCode: line.product_code,
    categoryId: line.category_id,
    categoryName: line.category_name,
    attributes: line.attribute_values ?? {},
    cashierId: line.cashier_id,
    cashierName: line.cashier_name,
    channelId: line.channel_id,
    channelName: line.channel_name,
  };
}
