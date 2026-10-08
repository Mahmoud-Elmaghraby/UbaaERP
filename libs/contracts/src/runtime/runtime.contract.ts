import { z } from 'zod';
import { strongPassword } from '../users-permissions/user.contract';

/**
 * GET /runtime — public, pre-login. Tells the web app which deployment it
 * is running against. On the desktop build there is exactly one fixed
 * tenant (CLAUDE.md §2.3), so the login screen takes the tenant from here
 * instead of asking for it, and `needsSetup` routes a fresh install to the
 * first-run screen that creates the Owner account.
 */
export const runtimeInfoSchema = z.discriminatedUnion('mode', [
  z.object({ mode: z.literal('cloud') }),
  z.object({
    mode: z.literal('desktop'),
    tenantSchema: z.string().min(1),
    needsSetup: z.boolean(),
    appVersion: z.string().nullable(),
  }),
]);
export type RuntimeInfoDto = z.infer<typeof runtimeInfoSchema>;

/** POST /desktop/setup — only accepted while the desktop tenant has no users at all. */
export const desktopSetupSchema = z.object({
  companyName: z.string().trim().min(1).max(200),
  ownerFullName: z.string().trim().min(1).max(200),
  email: z.string().trim().email(),
  password: strongPassword,
});
export type DesktopSetupInput = z.infer<typeof desktopSetupSchema>;
