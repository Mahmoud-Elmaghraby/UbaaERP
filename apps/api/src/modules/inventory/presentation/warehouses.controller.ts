import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post, UseGuards } from '@nestjs/common';
import {
  warehouseSchema,
  warehouseWithDefaultLocationSchema,
  createWarehouseSchema,
  updateWarehouseSchema,
  warehouseLocationSchema,
  createWarehouseLocationSchema,
  updateWarehouseLocationSchema,
  type WarehouseDto,
  type WarehouseWithDefaultLocationDto,
  type CreateWarehouseDto,
  type UpdateWarehouseDto,
  type WarehouseLocationDto,
  type CreateWarehouseLocationDto,
  type UpdateWarehouseLocationDto,
} from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { CurrentUser } from '../../../shared/auth/current-user.decorator';
import type { JwtAccessPayload } from '../../../shared/auth/jwt-payload.type';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { ZodValidationPipe } from '../../../shared/validation/zod-validation.pipe';
import { WarehousesService } from '../application/services/warehouses.service';
import { InventoryEventPublisher } from '../infrastructure/events/inventory-event-publisher';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('inventory.manage')
@Controller('warehouses')
export class WarehousesController {
  constructor(
    private readonly service: WarehousesService,
    private readonly connections: TenantConnectionManager,
    private readonly events: InventoryEventPublisher,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<WarehouseDto[]> {
    const db = this.connections.getClient(schema);
    const warehouses = await this.service.list(db);
    return warehouses.map((w) => warehouseSchema.parse(w));
  }

  @Get(':id')
  async getById(@CurrentTenantSchema() schema: string, @Param('id') id: string): Promise<WarehouseDto> {
    const db = this.connections.getClient(schema);
    const warehouse = await this.service.getById(db, id);
    return warehouseSchema.parse(warehouse);
  }

  @Post()
  async create(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Body(new ZodValidationPipe(createWarehouseSchema)) body: CreateWarehouseDto,
  ): Promise<WarehouseWithDefaultLocationDto> {
    const db = this.connections.getClient(schema);
    const warehouse = await this.service.create(db, body);
    this.events.publish('warehouse', 'created', {
      schema,
      entityId: warehouse.id,
      actorUserId: user.sub,
      metadata: { defaultLocationId: warehouse.defaultLocation.id },
    });
    return warehouseWithDefaultLocationSchema.parse(warehouse);
  }

  @Patch(':id')
  async update(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateWarehouseSchema)) body: UpdateWarehouseDto,
  ): Promise<WarehouseDto> {
    const db = this.connections.getClient(schema);
    const warehouse = await this.service.update(db, id, body);
    this.events.publish('warehouse', 'updated', { schema, entityId: warehouse.id, actorUserId: user.sub });
    return warehouseSchema.parse(warehouse);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async delete(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.delete(db, id);
    this.events.publish('warehouse', 'deleted', { schema, entityId: id, actorUserId: user.sub });
  }

  @Get(':id/locations')
  async listLocations(
    @CurrentTenantSchema() schema: string,
    @Param('id') id: string,
  ): Promise<WarehouseLocationDto[]> {
    const db = this.connections.getClient(schema);
    const locations = await this.service.listLocations(db, id);
    return locations.map((l) => warehouseLocationSchema.parse(l));
  }

  @Post(':id/locations')
  async addLocation(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createWarehouseLocationSchema)) body: CreateWarehouseLocationDto,
  ): Promise<WarehouseLocationDto> {
    const db = this.connections.getClient(schema);
    const location = await this.service.addLocation(db, id, body);
    this.events.publish('warehouse_location', 'created', {
      schema,
      entityId: location.id,
      actorUserId: user.sub,
      metadata: { warehouseId: id },
    });
    return warehouseLocationSchema.parse(location);
  }

  @Patch('locations/:locationId')
  async updateLocation(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('locationId') locationId: string,
    @Body(new ZodValidationPipe(updateWarehouseLocationSchema)) body: UpdateWarehouseLocationDto,
  ): Promise<WarehouseLocationDto> {
    const db = this.connections.getClient(schema);
    const location = await this.service.updateLocation(db, locationId, body);
    this.events.publish('warehouse_location', 'updated', { schema, entityId: location.id, actorUserId: user.sub });
    return warehouseLocationSchema.parse(location);
  }

  @Delete('locations/:locationId')
  @HttpCode(HttpStatus.NO_CONTENT)
  async deleteLocation(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('locationId') locationId: string,
  ): Promise<void> {
    const db = this.connections.getClient(schema);
    await this.service.deleteLocation(db, locationId);
    this.events.publish('warehouse_location', 'deleted', { schema, entityId: locationId, actorUserId: user.sub });
  }
}
