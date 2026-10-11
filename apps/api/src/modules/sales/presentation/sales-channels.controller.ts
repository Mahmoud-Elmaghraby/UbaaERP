import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import {
  saveChannelSettlementSchema,
  saveSalesChannelSchema,
  type ChannelSettlementDto,
  type ChannelSettlementSummaryDto,
  type ChannelUnpaidOrderDto,
  type SalesChannelDto,
  type SaveChannelSettlementDto,
  type SaveSalesChannelDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { SalesChannelsService } from '../application/services/sales-channels.service';
import { ChannelSettlementsService } from '../application/services/channel-settlements.service';

/** Sales channels (Jumia, Noon, direct…) and their weekly marketplace settlements. */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('sales.manage')
@Controller()
export class SalesChannelsController {
  constructor(
    private readonly channels: SalesChannelsService,
    private readonly settlements: ChannelSettlementsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get('sales-channels')
  listChannels(@CurrentTenantSchema() schema: string): Promise<SalesChannelDto[]> {
    return this.channels.list(this.connections.getClient(schema));
  }

  @Post('sales-channels')
  createChannel(
    @CurrentTenantSchema() schema: string,
    @Body(new ZodValidationPipe(saveSalesChannelSchema)) body: SaveSalesChannelDto,
  ): Promise<SalesChannelDto> {
    return this.channels.save(this.connections.getClient(schema), null, body);
  }

  @Put('sales-channels/:id')
  updateChannel(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveSalesChannelSchema)) body: SaveSalesChannelDto,
  ): Promise<SalesChannelDto> {
    return this.channels.save(this.connections.getClient(schema), id, body);
  }

  @Get('sales-channels/:id/unpaid-orders')
  unpaidOrders(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<ChannelUnpaidOrderDto[]> {
    return this.settlements.unpaidOrders(this.connections.getClient(schema), id);
  }

  @Get('channel-settlements')
  listSettlements(@CurrentTenantSchema() schema: string, @Query('channelId') channelId?: string): Promise<ChannelSettlementSummaryDto[]> {
    return this.settlements.list(this.connections.getClient(schema), channelId);
  }

  @Get('channel-settlements/:id')
  getSettlement(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<ChannelSettlementDto> {
    return this.settlements.getById(this.connections.getClient(schema), id);
  }

  @Post('channel-settlements')
  createSettlement(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(saveChannelSettlementSchema)) body: SaveChannelSettlementDto,
  ): Promise<ChannelSettlementDto> {
    return this.settlements.save(this.connections.getClient(schema), null, body, { actorUserId: user.sub });
  }

  @Put('channel-settlements/:id')
  updateSettlement(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(saveChannelSettlementSchema)) body: SaveChannelSettlementDto,
  ): Promise<ChannelSettlementDto> {
    return this.settlements.save(this.connections.getClient(schema), id, body, { actorUserId: user.sub });
  }

  @Patch('channel-settlements/:id/post')
  postSettlement(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<ChannelSettlementDto> {
    return this.settlements.post(this.connections.getClient(schema), id, { schema, actorUserId: user.sub });
  }

  @Delete('channel-settlements/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteSettlement(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<void> {
    await this.settlements.delete(this.connections.getClient(schema), id);
  }
}
