// 'mfa_challenge' added alongside 'password_reset'/'invite' (migration
// 0068) — see that migration's comment for why the login 2FA challenge
// reuses this same hashed/single-use/expiring token table.
export type AccountActionTokenPurpose = 'password_reset' | 'invite' | 'mfa_challenge';

export interface AccountActionToken {
  id: string;
  userId: string;
  purpose: AccountActionTokenPurpose;
  expiresAt: Date;
  usedAt: Date | null;
}
