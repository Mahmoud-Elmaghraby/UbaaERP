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
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { NestFactory } from '@nestjs/core';
import { DomainExceptionFilter } from './shared/errors/domain-exception.filter';
import { UnexpectedExceptionFilter } from './shared/errors/unexpected-exception.filter';
import { validateEnv } from './shared/config/env.validation';

async function bootstrap() {
  // Validated before AppModule is even imported (a dynamic import,
  // deliberately, not the usual static one) — several of AppModule's
  // own transitive imports read required env vars at decorator/factory
  // evaluation time (TenancyModule's mustGetDatabaseUrl(),
  // AuthInfraModule's mustGetAccessSecret()), which happens as soon as
  // that module graph is loaded. A static `import { AppModule }` at the
  // top of this file would resolve before this line ever ran (ES
  // imports are hoisted), so those individual checks would throw first,
  // one at a time, defeating the point of an aggregated upfront check.
  // Deferring the import to here guarantees validateEnv() genuinely
  // runs first and reports every problem at once.
  validateEnv();
  const { AppModule } = await import('./app.module');

  const app = await NestFactory.create(AppModule);
  // Order matters: Nest tries global filters in the order passed here and
  // stops at the first whose @Catch() types match. DomainExceptionFilter's
  // specific domain-error classes are checked first; UnexpectedExceptionFilter
  // (a bare @Catch()) is the last-resort net for everything else — see its
  // own header comment for why that used to reach the client unexplained.
  app.useGlobalFilters(new DomainExceptionFilter(), new UnexpectedExceptionFilter());
  // helmet() sets the standard set of security response headers (HSTS,
  // X-Content-Type-Options, X-Frame-Options, a conservative default CSP,
  // etc.) that were previously entirely absent from every response.
  app.use(helmet());
  // Reads the httpOnly refresh-token cookie AuthController sets/reads
  // (claude/settings-module-audit.md §2.2/Task 9) — Express's req.cookies
  // is undefined without this middleware; there is no built-in
  // alternative in @nestjs/platform-express.
  app.use(cookieParser());
  // apps/web (Vite dev server, e.g. http://localhost:5173) is a different
  // origin from the API (http://localhost:3000), so without CORS the
  // browser silently blocks every request before a response ever comes
  // back — found live: login kept failing with a generic network error
  // that the frontend was (until also fixed) misreporting as "invalid
  // credentials". CORS_ORIGIN accepts a comma-separated allowlist for
  // when a real origin is known (e.g. the eventual production web
  // origin, tied to the still-deferred hosting decision — CLAUDE.md §12).
  //
  // Previously, an unset CORS_ORIGIN silently reflected the request's
  // own origin in every environment — convenient for local dev, but a
  // real cross-tenant CSRF-adjacent risk if it ever shipped to
  // production unnoticed. Now: in production, CORS_ORIGIN is required
  // and boot fails loudly without it (the same "fail loudly, don't
  // guess" discipline already used for JWT_ACCESS_SECRET); everywhere
  // else, an unset value still reflects the request's origin for local
  // dev/testing convenience, with a console warning so it's never a
  // silent default.
  const corsOrigin = process.env.CORS_ORIGIN?.split(',').map((origin) => origin.trim());
  if (!corsOrigin && process.env.NODE_ENV === 'production') {
    throw new Error(
      'CORS_ORIGIN is not set. Refusing to start in production with CORS reflecting any request origin — set an explicit comma-separated allowlist.',
    );
  }
  if (!corsOrigin) {
    // eslint-disable-next-line no-console
    console.warn(
      '[cors] CORS_ORIGIN is not set — reflecting the request origin (dev-only behavior). Set CORS_ORIGIN before deploying.',
    );
  }
  // credentials: true is required for the browser to send/receive the
  // httpOnly refresh-token cookie cross-origin (apps/web's dev server is
  // a different origin from this API) — without it, fetch() silently
  // drops Set-Cookie on the response and never attaches the cookie on
  // the next request, regardless of the cookie's own SameSite setting.
  app.enableCors({ origin: corsOrigin ?? true, credentials: true });
  // Required for TenantConnectionManager.onApplicationShutdown to actually
  // run (NestJS lifecycle shutdown hooks are opt-in) — without this, every
  // per-tenant pg.Pool leaks connections on process exit instead of
  // closing cleanly.
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3000);
}

bootstrap();
