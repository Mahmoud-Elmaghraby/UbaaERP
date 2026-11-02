import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../../../../shared/database/prisma.service';
import { TenantConnectionManager } from '../../../../shared/tenancy/tenant-connection-manager';
import { isOutboxFeatureEnabled } from '../../../../shared/events/outbox-feature-gate';
import { FEATURE_KEYS } from '../../../../shared/plans/feature-catalog';
import { RecurringEntriesService } from '../../application/services/recurring-entries.service';
import { FixedAssetsService } from '../../application/services/fixed-assets.service';

const FIRST_RUN_DELAY_MS = 2 * 60 * 1000;
const INTERVAL_MS = 60 * 60 * 1000;

/**
 * Runs the accounting jobs that are due by the calendar — recurring
 * entries and the monthly depreciation — for every tenant with Accounting
 * on. Hourly, in-process setInterval (same reasoning as
 * OutboxDispatcherService: no scheduler dependency, one API process).
 * Both jobs are idempotent (next_run_date / UNIQUE asset+month), so a
 * second instance or a re-run never double-books.
 */
@Injectable()
export class AccountingSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(AccountingSchedulerService.name);
  private timers: ReturnType<typeof setTimeout>[] = [];
  private running: Promise<void> | null = null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly connections: TenantConnectionManager,
    private readonly recurring: RecurringEntriesService,
    private readonly fixedAssets: FixedAssetsService,
  ) {}

  onModuleInit(): void {
    if (process.env.NODE_ENV === 'test') return;
    const first = setTimeout(() => this.trigger(), FIRST_RUN_DELAY_MS);
    const every = setInterval(() => this.trigger(), INTERVAL_MS);
    first.unref?.();
    every.unref?.();
    this.timers = [first, every];
  }

  async onModuleDestroy(): Promise<void> {
    for (const timer of this.timers) clearTimeout(timer);
    if (this.running) await this.running;
  }

  private trigger(): void {
    if (this.running) return;
    this.running = this.runAll().finally(() => {
      this.running = null;
    });
  }

  private async runAll(): Promise<void> {
    try {
      const tenants = await this.prisma.tenant.findMany({ select: { schemaName: true } });
      for (const { schemaName } of tenants) {
        try {
          if (!(await isOutboxFeatureEnabled(schemaName, FEATURE_KEYS.ACCOUNTING))) continue;
          const db = this.connections.getClient(schemaName);
          await this.recurring.generateDue(db);
          await this.fixedAssets.runDepreciation(db);
        } catch (err) {
          this.logger.warn(`Accounting jobs failed for "${schemaName}": ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    } catch (err) {
      this.logger.error(`Could not list tenants for accounting jobs: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}
