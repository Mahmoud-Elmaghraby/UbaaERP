import { Global, Module } from '@nestjs/common';
import { EventEmitterModule } from '@nestjs/event-emitter';

/**
 * Global Event Bus module (master doc §5 / CLAUDE.md §2.6 [مستقر]),
 * wired for the first time here — no module before Inventory needed
 * cross-module communication (Settings/Users & Permissions are the
 * foundation step and don't talk to each other).
 *
 * `wildcard: true` lets a listener subscribe with a pattern like
 * 'inventory.**' (see UsersPermissionsModule's audit-log listener)
 * instead of one @OnEvent per concrete event name.
 */
@Global()
@Module({
  imports: [EventEmitterModule.forRoot({ wildcard: true, delimiter: '.' })],
  exports: [EventEmitterModule],
})
export class EventsModule {}
