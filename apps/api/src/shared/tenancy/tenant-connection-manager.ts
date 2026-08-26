import { Injectable, OnApplicationShutdown } from '@nestjs/common';
import type { Kysely } from 'kysely';
import {
  assertValidSchemaName,
  createTenantKyselyClient,
  type TenantDatabase,
} from '../../database/tenant/kysely-client';

/**
 * Caches one Kysely client (and its underlying pg.Pool) per tenant schema,
 * reused across requests — NOT one pool per HTTP request. Naively creating
 * `createTenantKyselyClient(...)` inside a request-scoped provider would
 * open a fresh pg.Pool on every request and leak connections, since
 * NestJS request-scoped providers have no reliable per-instance cleanup
 * hook for external resources like this.
 *
 * This is also the concrete place CLAUDE.md §2.3's connection-pooling
 * watch-point becomes real: as the number of concurrently active tenant
 * schemas grows, so does `clients.size`, and each entry holds its own
 * pg.Pool. Watching `clients.size` here is the "simple metric for active
 * DB connection count" §2.3 asks to be exposed from day one — wiring it
 * into real monitoring is a later task. When active tenants approach
 * ~50-100, §2.3 requires introducing PgBouncer (transaction pooling mode)
 * — not implemented yet, deliberately, per that section's own phasing.
 */
@Injectable()
export class TenantConnectionManager implements OnApplicationShutdown {
  private readonly clients = new Map<string, Kysely<TenantDatabase>>();

  constructor(private readonly databaseUrl: string) {}

  getClient(schemaName: string): Kysely<TenantDatabase> {
    assertValidSchemaName(schemaName);

    let client = this.clients.get(schemaName);
    if (!client) {
      client = createTenantKyselyClient(this.databaseUrl, schemaName);
      this.clients.set(schemaName, client);
    }
    return client;
  }

  /** Active tenant connection-pool count — see the class-level note on §2.3. */
  get activeSchemaCount(): number {
    return this.clients.size;
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([...this.clients.values()].map((client) => client.destroy()));
    this.clients.clear();
  }
}
