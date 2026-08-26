import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { auditLogSchema, type AuditLogDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { AuditLogsService } from '../application/services/audit-logs.service';

@Controller('audit-logs')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('audit_logs.view')
export class AuditLogsController {
  constructor(
    private readonly service: AuditLogsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(
    @CurrentTenantSchema() schema: string,
    @Query('userId') userId?: string,
    @Query('entityType') entityType?: string,
    @Query('action') action?: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ): Promise<AuditLogDto[]> {
    const db = this.connections.getClient(schema);
    const logs = await this.service.list(
      db,
      {
        userId,
        entityType,
        action,
        from: from ? new Date(from) : undefined,
        to: to ? new Date(to) : undefined,
      },
      limit ? Number(limit) : undefined,
      offset ? Number(offset) : undefined,
    );
    return logs.map((l) => auditLogSchema.parse(l));
  }
}
