// Loaded first, as a side effect, before any other import: several
// modules read process.env at decorator-evaluation time (e.g.
// TenancyModule's mustGetDatabaseUrl(), AuthInfraModule's
// mustGetAccessSecret()), which happens as soon as AppModule's import
// graph is required below — so .env must already be loaded by then.
// Previously nothing loaded it for the actual server (only Prisma's
// CLI incidentally auto-loads .env for the db:* scripts that import
// @prisma/client — a fragile, undocumented side effect this makes
// explicit and applies uniformly instead).
import 'dotenv/config';
import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DomainExceptionFilter } from './shared/errors/domain-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalFilters(new DomainExceptionFilter());
  // Required for TenantConnectionManager.onApplicationShutdown to actually
  // run (NestJS lifecycle shutdown hooks are opt-in) — without this, every
  // per-tenant pg.Pool leaks connections on process exit instead of
  // closing cleanly.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
