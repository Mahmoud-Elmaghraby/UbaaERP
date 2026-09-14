import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import {
  createExchangeRateSchema,
  exchangeRateSchema,
  exchangeRateSyncResultSchema,
  syncExchangeRatesSchema,
  type CreateExchangeRateDto,
  type ExchangeRateDto,
  type ExchangeRateSyncResultDto,
  type SyncExchangeRatesDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { PlanFeatureGuard } from '../../../shared/auth/plan-feature.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { RequireFeature } from '../../../shared/auth/require-feature.decorator';
import { FEATURE_KEYS } from '../../../shared/plans/feature-catalog';
import { FeatureAvailabilityService } from '../../../shared/plans/feature-availability.service';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { TenantSettingsService } from '../../settings/application/services/tenant-settings.service';
import { ExchangeRatesService } from '../application/services/exchange-rates.service';
import { ExchangeRateSyncService } from '../application/services/exchange-rate-sync.service';
import { AccountingEventPublisher } from '../infrastructure/events/accounting-event-publisher';
import { BusinessRuleError } from '../application/errors';

/**
 * Exchange-rate entry (claude/multi-currency-strategy.md — Phase 1:
 * manual entry; Phase 2, 2026-09-13: live-rate sync). No update/delete
 * on any path: see exchange-rate.entity.ts's own comment — a correction
 * is always a new row. Gated behind PlanFeatureGuard
 * (FEATURE_KEYS.ACCOUNTING), same as every other controller in this
 * module.
 *
 * POST /exchange-rates always writes source='manual'; POST
 * /exchange-rates/sync always writes source='api' via
 * ExchangeRateSyncService, which bypasses ExchangeRatesService's
 * validation and writes through the repository directly (see that
 * service's own header comment) — the two paths never fight over which
 * source wins for the same day, that's CurrencyConversionService's own
 * "prefer manual on a tie" rule (migration 0072).
 *
 * Both write actions (create/sync) also require FEATURE_KEYS.
 * MULTI_CURRENCY to be enabled for the tenant (assertMultiCurrencyEnabled()
 * below) — a second, additional gate on top of the class-level
 * ACCOUNTING one, added 2026-09-13 (claude/multi-currency-strategy.md
 * §9). list()/getById() stay ungated by it: a tenant that had rates from
 * before turning the feature off can still read them.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard, PlanFeatureGuard)
@RequirePermissions('accounting.manage')
@RequireFeature(FEATURE_KEYS.ACCOUNTING)
@Controller('exchange-rates')
export class ExchangeRatesController {
  constructor(
    private readonly service: ExchangeRatesService,
    private readonly syncService: ExchangeRateSyncService,
    private readonly connections: TenantConnectionManager,
    private readonly tenantSettings: TenantSettingsService,
    private readonly events: AccountingEventPublisher,
    private readonly featureAvailability: FeatureAvailabilityService,
  ) {}

  /**
   * Multi-currency gate (claude/multi-currency-strategy.md §9): a manual
   * rate entry or a live-rate sync is only meaningful once a tenant has
   * actually turned Multi-Currency on for themselves — see
   * FEATURE_KEYS.MULTI_CURRENCY's own comment for why this is a manual
   * check here rather than a second @RequireFeature() (the guard only
   * supports one key per route, and this controller's existing key,
   * ACCOUNTING, must stay). GET stays open regardless (list()/getById()
   * don't call this) — same "reads survive a toggle-off" convention
   * PlanFeatureGuard itself follows for every other feature key.
   */
  private async assertMultiCurrencyEnabled(db: Kysely<TenantDatabase>, schema: string): Promise<void> {
    const enabled = await this.featureAvailability.isEnabled(db, schema, FEATURE_KEYS.MULTI_CURRENCY);
    if (!enabled) {
      throw new BusinessRuleError(
        'Multi-Currency is not enabled for this tenant — enable it in Settings → Modules first.',
        { code: 'EXCHANGE_RATE.MULTI_CURRENCY_DISABLED' },
      );
    }
  }

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('fromCurrency') fromCurrency?: string,
    @Query('toCurrency') toCurrency?: string,
  ): Promise<ExchangeRateDto[]> {
    const db = this.connections.getClient(schema);
    const rates = await this.service.list(db, { fromCurrency, toCurrency });
    return rates.map((r) => exchangeRateSchema.parse(r));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<ExchangeRateDto> {
    const db = this.connections.getClient(schema);
    const rate = await this.service.getById(db, id);
    return exchangeRateSchema.parse(rate);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createExchangeRateSchema)) body: CreateExchangeRateDto,
  ): Promise<ExchangeRateDto> {
    const db = this.connections.getClient(schema);
    await this.assertMultiCurrencyEnabled(db, schema);
    const rate = await this.service.create(db, body);
    this.events.publish('exchange_rate', 'created', { schema, entityId: rate.id, actorUserId: user.sub });
    return exchangeRateSchema.parse(rate);
  }

  /**
   * Fetches today's rate from the live source (frankfurter.dev, see
   * FrankfurterExchangeRateProvider) for each requested currency against
   * the tenant's own base currency — never a client-supplied target, same
   * "server-determined" rule as JournalEntry.currency. Safe to call more
   * than once a day: a pair already synced today comes back as
   * status: 'already_up_to_date', not an error (no scheduler is wired up
   * yet — see ExchangeRateSyncService's own comment for why this is
   * on-demand for now).
   */
  @Post('sync')
  async sync(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(syncExchangeRatesSchema)) body: SyncExchangeRatesDto,
  ): Promise<ExchangeRateSyncResultDto[]> {
    const db = this.connections.getClient(schema);
    await this.assertMultiCurrencyEnabled(db, schema);
    const toCurrency = (await this.tenantSettings.get(db)).currencyCode;

    const results = await this.syncService.syncMany(
      db,
      body.fromCurrencies.map((fromCurrency) => ({ fromCurrency, toCurrency })),
    );

    for (const result of results) {
      if (result.status === 'synced' && result.rate) {
        this.events.publish('exchange_rate', 'created', { schema, entityId: result.rate.id, actorUserId: user.sub });
      }
    }

    return results.map((r) => exchangeRateSyncResultSchema.parse(r));
  }
}
