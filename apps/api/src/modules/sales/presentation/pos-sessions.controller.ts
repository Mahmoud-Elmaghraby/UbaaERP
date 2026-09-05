import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  posSessionSchema,
  openPosSessionSchema,
  closePosSessionSchema,
  type PosSessionDto,
  type OpenPosSessionDto,
  type ClosePosSessionDto,
} from '@erp-platform/contracts';
import type { PosSession, PosSessionStatus } from '../domain/pos-session.entity';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { PosSessionsService } from '../application/services/pos-sessions.service';
import { moneyFromDto, moneyToDto } from './money.mapper';

function toDto(session: PosSession): PosSessionDto {
  return posSessionSchema.parse({
    ...session,
    openingCashAmount: moneyToDto(session.openingCashAmount),
    expectedCashAmount: session.expectedCashAmount ? moneyToDto(session.expectedCashAmount) : null,
    countedCashAmount: session.countedCashAmount ? moneyToDto(session.countedCashAmount) : null,
    varianceAmount: session.varianceAmount ? moneyToDto(session.varianceAmount) : null,
  });
}

/**
 * POS Cash Sessions (CLAUDE.md §10 — step 4, Sales — POS feature, Stage
 * 1; see claude/sales-pos-research.md). A session always belongs to the
 * currently authenticated cashier — open()/close() never take a
 * cashierUserId in the request body, they use @CurrentUser()'s `sub`,
 * same "only the controller layer has request context" discipline as
 * every Outbox-writing service. Reusing 'sales.manage' rather than a
 * new permission key, same as every other Sales controller. No
 * PlanFeatureGuard yet — same deliberate, tracked gap as the rest of
 * this module.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller('pos-sessions')
export class PosSessionsController {
  constructor(
    private readonly service: PosSessionsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('status') status?: PosSessionStatus,
    @Query('cashierUserId') cashierUserId?: string,
  ): Promise<PosSessionDto[]> {
    const db = this.connections.getClient(schema);
    const sessions = await this.service.list(db, { status, cashierUserId });
    return sessions.map(toDto);
  }

  /** The current user's own open session, or null — the frontend's first call when entering the POS screen, to decide whether to show "open a session" or go straight to checkout. */
  @Get('current')
  async getCurrentOpen(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
  ): Promise<PosSessionDto | null> {
    const db = this.connections.getClient(schema);
    const session = await this.service.getOpenForCashier(db, user.sub);
    return session ? toDto(session) : null;
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<PosSessionDto> {
    const db = this.connections.getClient(schema);
    const session = await this.service.getById(db, id);
    return toDto(session);
  }

  @Post()
  async open(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(openPosSessionSchema)) body: OpenPosSessionDto,
  ): Promise<PosSessionDto> {
    const db = this.connections.getClient(schema);
    const session = await this.service.open(db, {
      cashierUserId: user.sub,
      openingCashAmount: moneyFromDto(body.openingCashAmount),
      notes: body.notes,
    });
    return toDto(session);
  }

  @Post(':id/close')
  async close(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(closePosSessionSchema)) body: ClosePosSessionDto,
  ): Promise<PosSessionDto> {
    const db = this.connections.getClient(schema);
    const session = await this.service.close(
      db,
      id,
      { countedCashAmount: moneyFromDto(body.countedCashAmount), notes: body.notes },
      schema,
      user.sub,
    );
    return toDto(session);
  }
}
