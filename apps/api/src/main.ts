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
