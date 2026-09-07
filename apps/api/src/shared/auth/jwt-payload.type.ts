/**
 * Shape of the ACCESS token payload (AuthService.issueTokens signs this;
 * JwtStrategy.validate returns it verbatim as request.user). Permissions
 * are baked in at sign time — see PermissionsGuard's class comment for
 * the staleness trade-off this implies. `features` is the same idea,
 * one level up: the tenant's plan-granted feature keys (see
 * ../plans/feature-catalog.ts), read by PlanFeatureGuard.
 */
export interface JwtAccessPayload {
  sub: string;
  schema: string;
  roleId: string;
  permissions: string[];
  features: string[];
}
