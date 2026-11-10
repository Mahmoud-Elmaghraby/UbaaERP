import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import { Money } from '@erp-platform/shared-kernel';
import type { RuleMode, SalesLimitsCheckDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { AppSettingsRepository } from '../../../../shared/app-settings/app-settings.repository';
import { daysBetween } from '../../../../shared/app-settings/document-date';
import { canViewCosts } from '../../../../shared/auth/inventory-permissions';
import { salePriceFloors } from '../../../../shared/catalog/sale-price-floor-reader';
import { FeatureAvailabilityService } from '../../../../shared/plans/feature-availability.service';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { localIsoDate } from '../../../../shared/time/local-date';
import { findPriceViolations, type PricedLine } from '../../domain/sales-limits';
import { distributeOrderTotalAcrossLines, type Discountable } from '../../domain/sales-order.entity';
import { BusinessRuleError } from '../errors';
import { deepestDiscountPercent } from './pos-rules';

/** Sell past the discount limit, below cost / the minimum price, return late (migration 0120). */
export const OVERRIDE_LIMITS_PERMISSION = 'sales.override_limits';

export interface LimitsDocument extends Discountable {
  schema: string;
  salesRepId: string | null;
  lines: (Discountable & { id: string; productVariantId: string; quantity: number; unitPrice: Money; unitFactor: number })[];
}

/**
 * The settings hub's sales limits (phase 2) for one draft order / direct invoice:
 * - 'sales.maxDiscountPercent': deepest discount (line or document) — over it needs the override;
 * - 'sales.belowCostMode' / 'sales.belowMinPriceMode': allow / warn (the screen asks) / block
 *   (unless the user may override);
 * - 'sales.repRequired' (with the sales-reps switch on): no rep, no confirm — nobody overrides it.
 * The same check feeds the editor (GET …/limits-check) and the confirm / post itself.
 */
@Injectable()
export class SalesLimitsService {
  constructor(
    private readonly settings: AppSettingsRepository,
    private readonly features: FeatureAvailabilityService,
  ) {}

  async check(db: Kysely<TenantDatabase>, doc: LimitsDocument, permissions: readonly string[]): Promise<SalesLimitsCheckDto> {
    const s = await this.settings.getMany(db, [
      'sales.maxDiscountPercent',
      'sales.belowCostMode',
      'sales.belowMinPriceMode',
      'sales.repRequired',
    ]);
    const canOverride = permissions.includes(OVERRIDE_LIMITS_PERMISSION);
    const costMode = s['sales.belowCostMode'] as RuleMode;
    const minMode = s['sales.belowMinPriceMode'] as RuleMode;

    const discountPercent = doc.lines.length ? Math.round(deepestDiscountPercent(doc) * 100) / 100 : 0;
    const discountLimit = s['sales.maxDiscountPercent'];
    const discountExceeded = discountLimit !== null && discountPercent > discountLimit + 0.005;

    let violations: SalesLimitsCheckDto['violations'] = [];
    if (doc.lines.length && (costMode !== 'allow' || minMode !== 'allow')) {
      const nets = distributeOrderTotalAcrossLines(doc, doc.lines);
      const priced: PricedLine[] = doc.lines.map((line, i) => ({
        lineId: line.id,
        productVariantId: line.productVariantId,
        netMinor: nets[i]!.toMinorUnits(),
        currency: line.unitPrice.currency,
        baseQuantity: line.quantity * (line.unitFactor || 1),
      }));
      const floors = await salePriceFloors(db, priced.map((l) => l.productVariantId));
      const showCost = canViewCosts(permissions);
      violations = findPriceViolations(priced, floors, { cost: costMode !== 'allow', min: minMode !== 'allow' }).map((v) => ({
        lineId: v.lineId,
        productVariantId: v.productVariantId,
        productName: v.productName,
        kind: v.kind,
        unitNet: Money.fromMinorUnits(v.unitNetMinor, v.currency).toDecimalString(),
        floor: v.kind === 'below_min' || showCost ? Money.fromMinorUnits(v.floorMinor, v.currency).toDecimalString() : null,
        currency: v.currency,
      }));
    }
    const modeOf = (kind: 'below_cost' | 'below_min') => (kind === 'below_cost' ? costMode : minMode);

    const repMissing =
      s['sales.repRequired'] && !doc.salesRepId && (await this.features.isEnabled(db, doc.schema, FEATURE_KEYS.SALES_REPS));

    const hardBlocked = violations.some((v) => modeOf(v.kind) === 'block') || discountExceeded;
    return {
      discountPercent,
      discountLimit,
      discountExceeded,
      belowCostMode: costMode,
      belowMinPriceMode: minMode,
      violations,
      repMissing,
      canOverride,
      needsConfirmation: violations.length > 0 || (hardBlocked && canOverride),
      blocked: repMissing || (hardBlocked && !canOverride),
    };
  }

  /** Throws the first rule that stops this user. */
  async assert(db: Kysely<TenantDatabase>, doc: LimitsDocument, permissions: readonly string[]): Promise<void> {
    const result = await this.check(db, doc, permissions);
    if (!result.blocked) return;
    if (result.repMissing) {
      throw new BusinessRuleError('A sales rep is required.', { code: 'SALES_LIMITS.REP_REQUIRED' });
    }
    if (result.discountExceeded) {
      throw new BusinessRuleError(`Discount ${result.discountPercent}% is above the limit of ${result.discountLimit}%.`, {
        code: 'SALES_LIMITS.DISCOUNT_ABOVE_LIMIT',
        params: { discount: result.discountPercent, limit: result.discountLimit ?? 0 },
      });
    }
    const v = result.violations.find((x) => (x.kind === 'below_cost' ? result.belowCostMode : result.belowMinPriceMode) === 'block')!;
    throw new BusinessRuleError(`"${v.productName}" is priced ${v.unitNet} ${v.currency}, below its ${v.kind === 'below_cost' ? 'cost' : 'minimum price'}.`, {
      code: v.kind === 'below_cost' ? 'SALES_LIMITS.BELOW_COST' : 'SALES_LIMITS.BELOW_MIN_PRICE',
      params: { product: v.productName, price: v.unitNet, floor: v.floor ?? '', currency: v.currency },
    });
  }

  /**
   * 'sales.returnWindowDays': goods delivered on `deliveredOn` may come back until that many days
   * later (null = any time). Holders of 'sales.override_limits' may accept a late return.
   */
  async assertReturnWindow(
    db: Kysely<TenantDatabase>,
    deliveredOn: string,
    returnDate: string | null,
    canOverride: boolean,
  ): Promise<void> {
    if (canOverride) return;
    const days = await this.settings.get(db, 'sales.returnWindowDays');
    if (days === null) return;
    const age = daysBetween(deliveredOn, returnDate ?? localIsoDate());
    if (age > days) {
      throw new BusinessRuleError(`The goods were delivered ${age} days ago; returns are accepted within ${days} days.`, {
        code: 'SALES_LIMITS.RETURN_WINDOW_PASSED',
        params: { age, days },
      });
    }
  }
}
