/**
 * EtaCredentials (CLAUDE.md §8; claude/sales-einvoice-spike.md). A
 * tenant-level singleton — see migration 0040's comment for the full
 * rationale. The raw client secret is intentionally never part of this
 * shape: `clientSecretConfigured` only says whether one has been set.
 */
export type EtaEnvironment = 'preprod' | 'production';

export interface EtaCredentials {
  id: string;
  clientId: string | null;
  clientSecretConfigured: boolean;
  taxRegistrationNumber: string | null;
  environment: EtaEnvironment;
  documentVersion: string;
  isEnabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface UpdateEtaCredentialsInput {
  clientId?: string | null;
  /** Plaintext — encrypted by EtaCredentialsService before reaching the repository. Omit to leave the stored secret unchanged; pass null to clear it. */
  clientSecret?: string | null;
  taxRegistrationNumber?: string | null;
  environment?: EtaEnvironment;
  documentVersion?: string;
  isEnabled?: boolean;
}
