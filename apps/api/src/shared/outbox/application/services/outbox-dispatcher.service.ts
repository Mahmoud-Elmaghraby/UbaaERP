import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OUTBOX_EVENT_REPOSITORY, type OutboxEventRepository } from '../ports/outbox-event.repository';
import { TenantConnectionManager } from '../../../tenancy/tenant-connection-manager';
import { PrismaService } from '../../../database/prisma.service';
import type { DomainEventPayload } from '../../../events/domain-event';

/** How often to poll every tenant's outbox_events table. */
const POLL_INTERVAL_MS = 5000;
/** Rows claimed per tenant per tick — a soft cap so one very backed-up tenant can't starve the rest within a single tick. */
const BATCH_SIZE = 20;
/** A row is marked permanently 'failed' (not retried again) once it has failed this many times. */
const MAX_ATTEMPTS = 10;

/**
 * The read/dispatch side of the Outbox Pattern (master doc §5/§2.7
 * [مستقر]). Polls every tenant's outbox_events table on a fixed
 * interval, claims a batch of pending rows (see
 * KyselyOutboxEventRepository.claimPending's FOR UPDATE SKIP LOCKED
 * comment), and re-emits each one on the SAME Event Bus
 * (EventEmitter2/@nestjs/event-emitter) every other integration event
 * already uses — a listener written for
 * `@OnEvent('purchases.purchase_invoice.posted')` doesn't know or care
 * whether the event reached it via this dispatcher or a direct
 * post-commit publish() call.
 *
 * The one real behavioral difference from the plain Event Bus path:
 * this uses `emitAsync()` and actually awaits + checks the result, so a
 * listener that throws causes a retry (up to MAX_ATTEMPTS) instead of a
 * silently-logged, never-retried failure — the reliability upgrade that
 * was explicitly deferred for Stage 5/6's inventory-quantity listeners
 * (see their class comments) and is now delivered for genuinely
 * financial events.
 *
 * In-process `setInterval`, not `@nestjs/schedule` (not a dependency of
 * this project, and one polling loop doesn't justify adding it) and not
 * a separate standalone worker process (this codebase's existing
 * standalone script, migration-runner.service.ts, is a one-shot CLI, not
 * a long-running daemon — introducing a second deployable process now
 * would be new deployment surface for a single-instance app). This
 * means the dispatcher only runs while the API process itself is up,
 * and if the API is ever scaled to multiple instances, every instance
 * runs its own poller — safe (never double-delivers) because of
 * FOR UPDATE SKIP LOCKED, just redundant polling work. Revisit if that
 * redundancy ever matters; not a correctness issue.
 *
 * Enumerating tenants (public.tenants, via PrismaService) is this app
 * process's first-ever runtime use of Prisma — see PrismaService's class
 * comment for why that's a deliberate, scoped exception to "tenant
 * resolution never queries public.tenants at request time."
 */
@Injectable()
export class OutboxDispatcherService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OutboxDispatcherService.name);
  private timer: ReturnType<typeof setInterval> | null = null;
  private ticking = false;

  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY) private readonly repository: OutboxEventRepository,
    private readonly connections: TenantConnectionManager,
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      void this.tick();
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  private async tick(): Promise<void> {
    // Guards against a tick still running (e.g. a slow tenant list, or
    // many tenants) when the next interval fires — ticks run
    // sequentially, never overlapping.
    if (this.ticking) return;
    this.ticking = true;
    try {
      const tenants = await this.prisma.tenant.findMany({ select: { schemaName: true } });
      for (const tenant of tenants) {
        try {
          await this.processTenant(tenant.schemaName);
        } catch (err) {
          this.logger.error(
            `Outbox dispatch failed for tenant schema "${tenant.schemaName}": ` +
              (err instanceof Error ? err.message : String(err)),
          );
        }
      }
    } catch (err) {
      this.logger.error(
        `Failed to list tenants for outbox dispatch: ${err instanceof Error ? err.message : String(err)}`,
      );
    } finally {
      this.ticking = false;
    }
  }

  private async processTenant(schemaName: string): Promise<void> {
    const db = this.connections.getClient(schemaName);
    const claimed = await this.repository.claimPending(db, BATCH_SIZE);

    for (const event of claimed) {
      try {
        const payload = event.payload as unknown as DomainEventPayload & { occurredAt: string };
        const revived: DomainEventPayload = { ...payload, occurredAt: new Date(payload.occurredAt) };
        await this.emitter.emitAsync(event.eventType, revived);
        await this.repository.markProcessed(db, event.id);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        this.logger.error(
          `Outbox event "${event.id}" (${event.eventType}, tenant "${schemaName}") failed on attempt ` +
            `${event.attempts + 1}: ${message}`,
        );
        await this.repository.markFailedAttempt(db, event.id, message, MAX_ATTEMPTS);
      }
    }
  }
}
