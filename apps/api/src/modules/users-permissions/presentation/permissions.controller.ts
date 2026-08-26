import { Controller, Get, UseGuards } from '@nestjs/common';
import { permissionSchema, type PermissionDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../../../shared/tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../../../shared/auth/current-tenant-schema.decorator';
import { JwtAuthGuard } from '../../../shared/auth/jwt-auth.guard';
import { PermissionsGuard } from '../../../shared/auth/permissions.guard';
import { RequirePermissions } from '../../../shared/auth/require-permissions.decorator';
import { PermissionsService } from '../application/services/permissions.service';

// Read-only system catalog (see 0007_create_permissions.ts). Gated behind
// roles.manage since the only reason to list permission keys is to
// assign them to a role.
@Controller('permissions')
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions('roles.manage')
export class PermissionsController {
  constructor(
    private readonly service: PermissionsService,
    private readonly connections: TenantConnectionManager,
  ) {}

  @Get()
  async list(@CurrentTenantSchema() schema: string): Promise<PermissionDto[]> {
    const db = this.connections.getClient(schema);
    const permissions = await this.service.list(db);
    return permissions.map((p) => permissionSchema.parse(p));
  }
}
