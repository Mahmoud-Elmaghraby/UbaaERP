import { BadRequestException, createParamDecorator, type ExecutionContext } from '@nestjs/common';
import { assertValidSchemaName } from '../../database/tenant/kysely-client';

const TENANT_SCHEMA_HEADER = 'x-tenant-schema';

/**
 * TEMPORARY tenant resolution (flagged, not a final design): reads the
 * tenant's schema name directly from a request header. This is a stand-in
 * for real session/JWT-based tenant resolution, which belongs to the
 * Users & Permissions module — built alongside Settings (CLAUDE.md §10)
 * but not yet implemented. Every Settings endpoint depends on *some* form
 * of tenant resolution to be callable at all, so this exists to make the
 * module testable end-to-end now; swapping it for the real mechanism once
 * auth exists should only touch this one file, not every controller.
 */
export const TenantSchema = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest<{ headers: Record<string, string | string[] | undefined> }>();
  const header = request.headers[TENANT_SCHEMA_HEADER];
  const schemaName = Array.isArray(header) ? header[0] : header;

  if (!schemaName) {
    throw new BadRequestException(
      `Missing required "${TENANT_SCHEMA_HEADER}" header (temporary tenant-resolution ` +
        'stand-in until the Users & Permissions module provides real session-based resolution).',
    );
  }

  try {
    assertValidSchemaName(schemaName);
  } catch (err) {
    throw new BadRequestException(err instanceof Error ? err.message : String(err));
  }

  return schemaName;
});
