import { z } from 'zod';

/**
 * Optional per-user TOTP two-factor authentication (claude/settings-
 * module-audit.md §2.5, Task 8) — setup is two calls on purpose: `setup`
 * generates and stores a pending secret without enabling anything yet,
 * `confirm` proves the user actually scanned/entered it correctly
 * before 2FA starts being required at login. See TwoFactorService's
 * class comment for why.
 */
/** The only TOTP state ever exposed to the frontend (never the secret,
 * pending or otherwise) — GET /users/me/2fa/status, so the profile page
 * can render "enable" vs "disable" without a totp_enabled field on the
 * general user profile/list endpoints. */
export const totpStatusResponseSchema = z.object({
  enabled: z.boolean(),
});
export type TotpStatusResponseDto = z.infer<typeof totpStatusResponseSchema>;

export const totpSetupResponseSchema = z.object({
  /** Base32 secret, shown once for manual entry into an authenticator
   * app (this codebase does not render a QR code image itself — see
   * two-factor-card.tsx's comment). */
  secret: z.string().min(1),
  /** `otpauth://` URI an authenticator app can import directly if the
   * frontend renders it as a QR code. */
  otpauthUri: z.string().min(1),
});
export type TotpSetupResponseDto = z.infer<typeof totpSetupResponseSchema>;

export const confirmTotpSchema = z.object({
  code: z.string().length(6),
});
export type ConfirmTotpDto = z.infer<typeof confirmTotpSchema>;

export const totpEnabledResponseSchema = z.object({
  /** Shown to the user exactly once — neither this response nor any
   * later call ever exposes them again (only their hashes are stored). */
  backupCodes: z.array(z.string()),
});
export type TotpEnabledResponseDto = z.infer<typeof totpEnabledResponseSchema>;

export const disableTotpSchema = z.object({
  password: z.string().min(1),
});
export type DisableTotpDto = z.infer<typeof disableTotpSchema>;
