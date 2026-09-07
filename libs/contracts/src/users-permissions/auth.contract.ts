import { z } from 'zod';
import { userSchema, strongPassword } from './user.contract';

export const loginRequestSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});
export type LoginRequestDto = z.infer<typeof loginRequestSchema>;

/**
 * accessToken + user only — no refreshToken field. Previously this
 * schema also carried `refreshToken: z.string()` in the response body,
 * which meant it briefly existed as a JS value the frontend then wrote
 * straight into localStorage; now AuthController sets it directly as an
 * httpOnly cookie and never puts it in a JSON body at all.
 */
export const authTokensSchema = z.object({
  accessToken: z.string(),
  user: userSchema.pick({ id: true, email: true, fullName: true, roleId: true }),
});
export type AuthTokensDto = z.infer<typeof authTokensSchema>;

/**
 * login()'s alternative response when the account has TOTP 2FA enabled
 * (claude/settings-module-audit.md §2.5/Task 8) — no session exists yet;
 * the frontend must collect a code and call POST /auth/login/verify-2fa
 * with this challengeToken before a real session is created.
 */
export const mfaChallengeSchema = z.object({
  mfaRequired: z.literal(true),
  challengeToken: z.string().min(1),
});
export type MfaChallengeDto = z.infer<typeof mfaChallengeSchema>;

/** POST /auth/login's actual response shape — either a real session or
 * a 2FA challenge. Frontend code should check `'mfaRequired' in result`
 * (or `zod`-parse against this union) to tell the two apart. */
export const loginResponseSchema = z.union([authTokensSchema, mfaChallengeSchema]);
export type LoginResponseDto = z.infer<typeof loginResponseSchema>;

export const verifyTwoFactorSchema = z.object({
  challengeToken: z.string().min(1),
  // Accepts either a 6-digit TOTP code or an 8-character (plus an
  // optional separating dash) backup code — AuthService/TwoFactorService
  // try both, so the contract doesn't need the caller to say which.
  code: z.string().min(6).max(12),
});
export type VerifyTwoFactorDto = z.infer<typeof verifyTwoFactorSchema>;

// --- Password reset / invite-acceptance -------------------------------------
// Both flows share one redemption endpoint (AccountAccessService.consumeToken) —
// see that service's own comment for why a single "token + new password"
// shape covers both "forgot password" and "accept an admin's invite".

export const requestPasswordResetSchema = z.object({
  email: z.string().email(),
});
export type RequestPasswordResetDto = z.infer<typeof requestPasswordResetSchema>;

export const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: strongPassword,
});
export type ResetPasswordDto = z.infer<typeof resetPasswordSchema>;
