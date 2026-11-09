import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query, UseGuards } from '@nestjs/common';
import {
  chequeDateSchema,
  collectChequeSchema,
  type ChequeDateDto,
  type CollectChequeDto,
  type ReceivedChequeDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { SALES_PERMISSIONS as S } from '../../../shared/auth/trade-permissions';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { ReceivedChequesService } from '../application/services/received-cheques.service';

/** أوراق القبض: received cheques and their collection / bounce. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('cheques/received')
export class ReceivedChequesController {
  constructor(
    private readonly service: ReceivedChequesService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  @RequirePermissions(S.view)
  list(
    @CurrentTenantSchema() schema: string,
    @Query('status') status?: string,
    @Query('customerId') customerId?: string,
  ): Promise<ReceivedChequeDto[]> {
    return this.service.list(this.connections.getClient(schema), { status: status || undefined, customerId: customerId || undefined });
  }

  @Post(':id/collect')
  @RequirePermissions(S.post)
  @HttpCode(HttpStatus.NO_CONTENT)
  async collect(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(collectChequeSchema)) body: CollectChequeDto,
  ): Promise<void> {
    await this.service.collect(this.connections.getClient(schema), id, body, { schema, actorUserId: user.sub });
  }

  @Post(':id/bounce')
  @RequirePermissions(S.post)
  @HttpCode(HttpStatus.NO_CONTENT)
  async bounce(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(chequeDateSchema)) body: ChequeDateDto,
  ): Promise<void> {
    await this.service.bounce(this.connections.getClient(schema), id, body, { schema, actorUserId: user.sub });
  }
}
