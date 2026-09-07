// Shared helper for *.e2e-spec.ts files: boots the exact same AppModule
// wiring main.ts uses (same guards, same DomainExceptionFilter), so these
// tests exercise the real app through real HTTP via supertest — not a
// hand-assembled subset of providers.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import cookieParser from 'cookie-parser';
import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/shared/errors/domain-exception.filter';

export async function createE2eApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new DomainExceptionFilter());
  // AuthController reads/writes the refresh-token cookie via req.cookies /
  // res.cookie() (see its own class comment) — main.ts wires this same
  // middleware for the real server; without it here, req.cookies is
  // undefined and every refresh/logout call in e2e tests would silently
  // behave as if no cookie was ever sent.
  app.use(cookieParser());
  await app.init();
  return app;
}
