import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/**
 * Global module for the public-schema Prisma client — see
 * PrismaService's class comment for why this exists and who actually
 * needs it (OutboxDispatcherService, today). Global so any future
 * feature needing public-schema access (tenant admin APIs, etc.) can
 * inject PrismaService without every module re-wiring it, same pattern
 * as TenancyModule/EventsModule.
 */
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
