import { Global, Module } from '@nestjs/common';
import { PlanResolverService } from './plan-resolver.service';

/**
 * Global (same pattern as PrismaModule/TenancyModule) so any module that
 * needs to resolve a tenant's granted feature keys — today, just
 * AuthService, at token-issue time — can inject PlanResolverService
 * without UsersPermissionsModule (or any future consumer) re-declaring
 * the wiring.
 */
@Global()
@Module({
  providers: [PlanResolverService],
  exports: [PlanResolverService],
})
export class PlansModule {}
