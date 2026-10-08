import { Controller, Get, Param, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import type { PrintableDocumentTypeDto, PrintResponseDto } from '@erp-platform/contracts';
import { TenantConnectionManager } from '../tenancy/tenant-connection-manager';
import { CurrentTenantSchema } from '../auth/current-tenant-schema.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { JwtAccessPayload } from '../auth/jwt-payload.type';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../auth/permissions.guard';
import { RequirePermissions } from '../auth/require-permissions.decorator';
import { PrintRegistry } from './print-registry';
import { PrintService } from './print.service';

/**
 * Central print endpoint. Permission is per document type (the provider's
 * own list, the same as opening that document), checked in PrintService.
 */
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermissions()
@Controller('print')
export class PrintController {
  constructor(
    private readonly service: PrintService,
    private readonly registry: PrintRegistry,
    private readonly connections: TenantConnectionManager,
  ) {}

  /** Printable document types (for Settings › print templates). */
  @Get('document-types')
  documentTypes(): PrintableDocumentTypeDto[] {
    return this.registry
      .list()
      .map((provider) => ({ documentType: provider.documentType, label: provider.label, paperSizes: provider.paperSizes }));
  }

  @Get(':documentType/:id')
  render(
    @CurrentTenantSchema() schema: string,
    @CurrentUser() user: JwtAccessPayload,
    @Param('documentType') documentType: string,
    @Param('id', new ParseUUIDPipe()) id: string,
    @Query() query: Record<string, unknown>,
  ): Promise<PrintResponseDto> {
    const options = Object.fromEntries(
      Object.entries(query).filter((entry): entry is [string, string] => typeof entry[1] === 'string'),
    );
    return this.service.render(this.connections.getClient(schema), documentType, id, user.permissions, options);
  }
}
