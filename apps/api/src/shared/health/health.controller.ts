import { Controller, Get, HttpException, HttpStatus } from '@nestjs/common';
import { PrismaService } from '../database/prisma.service';

/**
 * Unauthenticated liveness/readiness endpoint — there was previously no
 * way for a load balancer, container orchestrator, or simple uptime
 * monitor to ask "is this process actually serving traffic correctly"
 * without hitting a real business route. Deliberately outside any
 * module and outside JwtAuthGuard/PermissionsGuard: a health check that
 * requires authentication to answer isn't one.
 *
 * The DB check queries the public schema via PrismaService (already a
 * global provider — see its own class comment) rather than any specific
 * tenant schema: this is schema-per-tenant (CLAUDE.md §2.3), so there is
 * no single "the" tenant database to represent overall health, but
 * Postgres itself being reachable at all is the thing actually worth
 * signaling — if the public schema is unreachable, every tenant schema
 * on the same instance is unreachable too.
 */
@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check(): Promise<{ status: 'ok'; database: 'ok' }> {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
    } catch (err) {
      throw new HttpException(
        { status: 'error', database: 'unreachable' },
        HttpStatus.SERVICE_UNAVAILABLE,
        { cause: err },
      );
    }
    return { status: 'ok', database: 'ok' };
  }
}
