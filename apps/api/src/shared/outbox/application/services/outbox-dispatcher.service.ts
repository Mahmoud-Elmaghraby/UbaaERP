import { Injectable, Logger, OnModuleInit, OnModuleDestroy, Inject } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { OUTBOX_EVENT_REPOSITORY, type OutboxEventRepository } from '../ports/outbox-event.repository';
import { TenantConnectionManager } from '../../../tenancy/tenant-connection-manager';
import { PrismaService } from '../../../database/prisma.service';
import type { DomainEventPayload } from '../../../events/domain-event';
import { DomainError, LEGACY_ERROR_CODE } from '../../../errors/domain-errors';
import { formatArMessage } from '../../../errors/error-messages.ar';

/** How often to poll every tenant's outbox_events table. */
const POLL_INTERVAL_MS = 5000;
/** Rows claimed per tenant per tick — a soft cap so one very backed-up tenant can't starve the rest within a single tick. */
const BATCH_SIZE = 20;
/** A row is marked permanently 'failed' (not retried again) once it has failed this many times. */
/** With the back-off of migration 0087 (10 s doubling, capped at 1 h) this is about 4.5 hours of retries. */
const MAX_ATTEMPTS = 12;

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
  /**
   * The currently in-flight tick(), if any — awaited by onModuleDestroy
   * below. Without this, a tick that happened to be mid-query when
   * shutdown began could still be running when
   * TenantConnectionManager.onApplicationShutdown() destroys the very
   * pg.Pool that query is using: NestJS runs every onModuleDestroy hook
   * across the whole app to completion before any onApplicationShutdown
   * hook starts, so onApplicationShutdown had no way to know this
   * still-running tick existed. Observed as "driver has already been
   * destroyed" in the log and, in the worst case, a hung `pool.end()`
   * (it waits for every checked-out client to be released) that can
   * block `app.close()` past a test's afterAll timeout. This was always
   * possible — POLL_INTERVAL_MS is short enough that a tick can land at
   * any point in a short-lived process's lifetime — awaiting it here
   * closes the race regardless of timing.
   */
  private tickPromise: Promise<void> | null = null;

  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY) private readonly repository: OutboxEventRepository,
    private readonly connections: TenantConnectionManager,
    private readonly prisma: PrismaService,
    private readonly emitter: EventEmitter2,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.tickPromise = this.tick();
    }, POLL_INTERVAL_MS);
  }

  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    if (this.tickPromise) await this.tickPromise;
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
        const message = describeError(err);
        this.logger.error(
          `Outbox event "${event.id}" (${event.eventType}, tenant "${schemaName}") failed on attempt ` +
            `${event.attempts + 1}: ${message}`,
        );
        await this.repository.markFailedAttempt(db, event.id, message, MAX_ATTEMPTS);
      }
    }
  }
}

/**
 * What the "background operations" screen shows: the Arabic message for a
 * coded domain error (e.g. "insufficient stock for X"), with its code, else
 * the raw message.
 */
function describeError(err: unknown): string {
  if (err instanceof DomainError && err.code !== LEGACY_ERROR_CODE) {
    return `${formatArMessage(err.code, err.params)} [${err.code}]`;
  }
  return err instanceof Error ? err.message : String(err);
}
