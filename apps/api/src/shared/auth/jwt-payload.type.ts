/**
 * Shape of the ACCESS token payload (AuthService.issueTokens signs this;
 * JwtStrategy.validate returns it verbatim as request.user). Permissions
 * are baked in at sign time — see PermissionsGuard's class comment for
 * the staleness trade-off this implies. `features` is the same idea,
 * one level up: the tenant's plan-granted feature keys (Layer 1, see
 * ../plans/feature-catalog.ts). `disabledFeatures` is Layer 2
 * (claude/platform-flexibility-strategy.md) — the feature keys this
 * tenant has explicitly turned off for themselves (Settings' "Modules"
 * tab), a small array since most tenants disable nothing. Both are read
 * by PlanFeatureGuard.
 */
export interface JwtAccessPayload {
  sub: string;
  schema: string;
  roleId: string;
  permissions: string[];
  features: string[];
  disabledFeatures: string[];
}
