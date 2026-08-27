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
  // apps/web (Vite dev server, e.g. http://localhost:5173) is a different
  // origin from the API (http://localhost:3000), so without CORS the
  // browser silently blocks every request before a response ever comes
  // back — found live: login kept failing with a generic network error
  // that the frontend was (until also fixed) misreporting as "invalid
  // credentials". CORS_ORIGIN accepts a comma-separated allowlist for
  // when a real origin is known (e.g. the eventual production web
  // origin, tied to the still-deferred hosting decision — CLAUDE.md §12);
  // unset, it reflects the request's own origin, which is fine for local
  // dev but should become an explicit allowlist before any production
  // deployment.
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim());
  app.enableCors({ origin: corsOrigin ?? true, credentials: true });
  // Required for TenantConnectionManager.onApplicationShutdown to actually
  // run (NestJS lifecycle shutdown hooks are opt-in) — without this, every
  // per-tenant pg.Pool leaks connections on process exit instead of
  // closing cleanly.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
