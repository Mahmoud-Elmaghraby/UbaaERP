import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { PurchaseLimitsCheckDto, RuleMode } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
import { PURCHASES_PERMISSIONS } from '../../../../shared/auth/trade-permissions';
import { applyRate, CurrencyRateReader } from '../../../../shared/catalog/currency-rate-reader';
import { localIsoDate } from '../../../../shared/time/local-date';
import { findPriceIncreases, withTolerance, type PurchasePricedLine } from '../../domain/purchase-limits';
import { BusinessRuleError } from '../errors';
import { lastPurchasePrices } from './last-purchase-prices';

export interface PurchaseLimitsDocument {
  /** The purchase order the document belongs to (its own lines don't count as "the last price"). */
  purchaseOrderId: string | null;
  lines: PurchasePricedLine[];
  /** Orders, and direct invoices (which are their own order): the approval amount applies. */
  checkApproval: boolean;
  /** Invoices only: 'purchases.supplierInvoiceNumberRequired' and the number is empty. */
  supplierInvoiceNumberMissing?: boolean;
}

/**
 * The settings hub's purchases limits (phase 3):
 * - 'purchases.orderApprovalAmount': an order at or above it (in the company currency) is confirmed
 *   only by a holder of 'purchases.approve' — the buyer prepares it, the manager confirms it;
 * - 'purchases.priceIncreaseMode' + 'purchases.priceIncreaseTolerancePercent': buying above the
 *   last price — allow / warn (the screen asks) / block (unless 'purchases.approve');
 * - 'purchases.supplierInvoiceNumberRequired': no supplier number, no posting (nobody overrides);
 * - 'purchases.overReceiptTolerancePercent': how far receipts and invoices may exceed the ordered
 *   quantity (applied by GoodsReceiptsService / PurchaseInvoicesService through orderedLimit()).
 */
@Injectable()
export class PurchaseLimitsService {
  private readonly rates = new CurrencyRateReader();

  constructor(private readonly settings: AppSettingsRepository) {}

  async check(db: Kysely<TenantDatabase>, doc: PurchaseLimitsDocument, permissions: readonly string[]): Promise<PurchaseLimitsCheckDto> {
    const s = await this.settings.getMany(db, [
      'purchases.orderApprovalAmount',
      'purchases.priceIncreaseMode',
      'purchases.priceIncreaseTolerancePercent',
    ]);
    const canApprove = permissions.includes(PURCHASES_PERMISSIONS.approve);
    const companyCurrency = await this.rates.tenantCurrency(db);
    const mode = s['purchases.priceIncreaseMode'] as RuleMode;
    const tolerance = s['purchases.priceIncreaseTolerancePercent'];

    // Approval: the order total in the company currency (no rate on file → treated as reaching it).
    const threshold = s['purchases.orderApprovalAmount'];
    let approvalRequired = false;
    if (doc.checkApproval && threshold !== null && doc.lines.length > 0) {
      const currency = doc.lines[0]!.currency;
      const totalMinor = doc.lines.reduce((sum, l) => sum + l.netMinor, 0n);
      const thresholdMinor = BigInt(Math.round(threshold * 100));
      if (currency === companyCurrency) {
        approvalRequired = totalMinor >= thresholdMinor;
      } else {
        const rate = await this.rates.effectiveRate(db, currency, companyCurrency, localIsoDate());
        approvalRequired = rate === null || applyRate(totalMinor, rate) >= thresholdMinor;
      }
    }

    let priceIncreases: PurchaseLimitsCheckDto['priceIncreases'] = [];
    if (mode !== 'allow' && doc.lines.length > 0) {
      const variantIds = doc.lines.map((l) => l.productVariantId);
      const [last, names] = await Promise.all([lastPurchasePrices(db, variantIds, doc.purchaseOrderId), this.productNames(db, variantIds)]);
      priceIncreases = findPriceIncreases(doc.lines, last, tolerance).map((p) => ({
        lineId: p.lineId,
        productVariantId: p.productVariantId,
        productName: names.get(p.productVariantId) ?? '',
        unitPrice: Money.fromMinorUnits(p.unitMinor, p.currency).toDecimalString(),
        lastPrice: Money.fromMinorUnits(p.lastMinor, p.currency).toDecimalString(),
        currency: p.currency,
        increasePercent: p.increasePercent,
        lastDocument: p.lastDocument,
      }));
    }

    const missingNumber = Boolean(doc.supplierInvoiceNumberMissing);
    const needsApprover = approvalRequired || (mode === 'block' && priceIncreases.length > 0);
    return {
      approvalRequired,
      approvalAmount: threshold === null ? null : threshold.toFixed(2),
      companyCurrency,
      priceIncreaseMode: mode,
      priceIncreaseTolerance: tolerance,
      priceIncreases,
      supplierInvoiceNumberMissing: missingNumber,
      canApprove,
      needsConfirmation: priceIncreases.length > 0 || (needsApprover && canApprove),
      blocked: missingNumber || (needsApprover && !canApprove),
    };
  }

  /** Throws the first rule that stops this user. */
  async assert(db: Kysely<TenantDatabase>, doc: PurchaseLimitsDocument, permissions: readonly string[]): Promise<void> {
    const result = await this.check(db, doc, permissions);
    if (!result.blocked) return;
    if (result.supplierInvoiceNumberMissing) {
      throw new BusinessRuleError('The supplier invoice number is required.', { code: 'PURCHASE_LIMITS.SUPPLIER_INVOICE_NUMBER_REQUIRED' });
    }
    if (result.approvalRequired) {
      throw new BusinessRuleError(`Orders of ${result.approvalAmount} ${result.companyCurrency} or more need approval.`, {
        code: 'PURCHASE_LIMITS.APPROVAL_REQUIRED',
        params: { amount: result.approvalAmount ?? '', currency: result.companyCurrency },
      });
    }
    const p = result.priceIncreases[0]!;
    throw new BusinessRuleError(`"${p.productName}" is ${p.increasePercent}% above its last purchase price.`, {
      code: 'PURCHASE_LIMITS.PRICE_ABOVE_LAST',
      params: { product: p.productName, price: p.unitPrice, last: p.lastPrice, percent: p.increasePercent, currency: p.currency, document: p.lastDocument },
    });
  }

  /** What receipts / invoices may reach on one order line, base units ('purchases.overReceiptTolerancePercent'). */
  async orderedLimit(db: Kysely<TenantDatabase>): Promise<(orderedBase: number) => number> {
    const tolerance = await this.settings.get(db, 'purchases.overReceiptTolerancePercent');
    return (orderedBase) => withTolerance(orderedBase, tolerance);
  }

  private async productNames(db: Kysely<TenantDatabase>, variantIds: readonly string[]): Promise<Map<string, string>> {
    const ids = [...new Set(variantIds)];
    if (ids.length === 0) return new Map();
    const rows = await db
      .selectFrom('product_variants as v')
      .innerJoin('products as p', 'p.id', 'v.product_id')
      .select(['v.id', 'p.name'])
      .where('v.id', 'in', ids)
      .execute();
    return new Map(rows.map((r) => [r.id, r.name]));
  }
}
