import { Controller, Get, HttpCode, NotFoundException, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  outboxEventSchema,
  outboxSummarySchema,
  type OutboxEventDto,
  type OutboxSummaryDto,
} from '@erp-platform/contracts';
import { Inject } from '@nestjs/common';
import { TenantConnectionManager } from '../../tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { PermissionsGuard } from '../../auth/permissions.guard';
import { RequirePermissions } from '../../auth/require-permissions.decorator';
import { OUTBOX_EVENT_REPOSITORY, type OutboxEventRepository } from '../application/ports/outbox-event.repository';
import type { OutboxEvent, OutboxEventStatus } from '../domain/outbox-event.entity';

const VISIBLE: OutboxEventStatus[] = ['pending', 'processing', 'failed'];

function toDto(event: OutboxEvent): OutboxEventDto {
  const payload = event.payload as { entityType?: unknown; entityId?: unknown };
  return outboxEventSchema.parse({
    id: event.id,
    eventType: event.eventType,
    status: event.status,
    attempts: event.attempts,
    lastError: event.lastError,
    entityType: typeof payload.entityType === 'string' ? payload.entityType : null,
    entityId: typeof payload.entityId === 'string' ? payload.entityId : null,
    createdAt: event.createdAt,
  });
}

/**
 * "Background operations" (العمليات في الخلفية): the outbox rows that
 * haven't completed — waiting, in progress, or failed after every retry —
 * so an admin can see why a stock movement / journal entry didn't happen
 * and send it again once the cause is fixed (e.g. stock was received).
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('settings.manage')
@Controller('outbox-events')
export class OutboxEventsController {
  constructor(
    @Inject(OUTBOX_EVENT_REPOSITORY) private readonly repository: OutboxEventRepository,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('summary')
  async summary(@CurrentTenantSchema() schema: string): Promise<OutboxSummaryDto> {
    const counts = await this.repository.countByStatus(this.connections.getClient(schema));
    return outboxSummarySchema.parse({
      pending: counts.pending ?? 0,
      processing: counts.processing ?? 0,
      failed: counts.failed ?? 0,
    });
  }

  @Get()
  async list(@CurrentTenantSchema() schema: string, @Query('status') status?: string): Promise<OutboxEventDto[]> {
    const statuses = status && (VISIBLE as string[]).includes(status) ? [status as OutboxEventStatus] : VISIBLE;
    const events = await this.repository.list(this.connections.getClient(schema), { statuses, limit: 200 });
    return events.map(toDto);
  }

  /** Puts a failed operation back in the queue (fresh retry budget). */
  @Post(':id/retry')
  @HttpCode(204)
  async retry(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    const requeued = await this.repository.requeueFailed(this.connections.getClient(schema), id);
    if (!requeued) throw new NotFoundException('No failed operation with this id.');
  }
}
