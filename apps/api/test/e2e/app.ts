// Shared helper for *.e2e-spec.ts files: boots the exact same AppModule
// wiring main.ts uses (same guards, same DomainExceptionFilter), so these
// tests exercise the real app through real HTTP via supertest — not a
// hand-assembled subset of providers.
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from '../../src/app.module';
import { DomainExceptionFilter } from '../../src/shared/errors/domain-exception.filter';

export async function createE2eApp(): Promise<INestApplication> {
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = moduleRef.createNestApplication();
  app.useGlobalFilters(new DomainExceptionFilter());
  await app.init();
  return app;
}
