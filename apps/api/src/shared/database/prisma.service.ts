import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * The running API process's first-ever public-schema (Prisma) client.
 * Everywhere else, tenant resolution deliberately avoids querying
 * public.tenants at request time — CurrentTenantSchema reads the schema
 * straight out of the verified JWT instead (see that decorator's class
 * comment), precisely so ordinary request handling never needs this.
 *
 * OutboxDispatcherService (shared/outbox/) is the one exception: it's a
 * background job, not a request handler, and it genuinely needs to
 * enumerate every tenant in public.tenants to poll each one's
 * outbox_events table. Before this, only the standalone CLI scripts
 * (migration-runner.service.ts and friends) touched Prisma — this is the
 * same generated client, just now also usable from inside the long-lived
 * app process for that one background-job purpose. Not a new dependency
 * — `@prisma/client` was already in package.json.
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
