import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import {
  ETA_CREDENTIALS_REPOSITORY,
  type EtaCredentialsRepository,
} from '../ports/eta-credentials.repository';
import type { EtaCredentials, UpdateEtaCredentialsInput } from '../../domain/eta-credentials.entity';
import { SecretsEncryptionService } from '../../../../shared/crypto/secrets-encryption.service';
import { BusinessRuleError } from '../errors';

/**
 * CLAUDE.md §8 / claude/sales-einvoice-spike.md. Config-only for now —
 * see migration 0040's comment. `getDecryptedClientSecret()` exists for
 * the future e-invoice submission engine (attaches at the Sales Invoices
 * stage) to call; nothing in this pass calls it.
 */
@Injectable()
export class EtaCredentialsService {
  constructor(
    @Inject(ETA_CREDENTIALS_REPOSITORY) private readonly repository: EtaCredentialsRepository,
    private readonly encryption: SecretsEncryptionService,
  ) {}

  get(db: Kysely<TenantDatabase>): Promise<EtaCredentials> {
    return this.repository.getOrCreate(db);
  }

  async update(db: Kysely<TenantDatabase>, input: UpdateEtaCredentialsInput): Promise<EtaCredentials> {
    if (input.isEnabled === true) {
      await this.assertReadyToEnable(db, input);
    }

    const { clientSecret, ...rest } = input;
    return this.repository.update(db, {
      ...rest,
      ...(clientSecret !== undefined
        ? { clientSecretEncrypted: clientSecret === null ? null : this.encryption.encrypt(clientSecret) }
        : {}),
    });
  }

  /**
   * Decrypts and returns the stored client secret, or null if none is
   * configured. Not called from anywhere yet — reserved for the
   * submission engine described in claude/sales-einvoice-spike.md §6.
   */
  async getDecryptedClientSecret(db: Kysely<TenantDatabase>): Promise<string | null> {
    const encrypted = await this.repository.getEncryptedClientSecret(db);
    return encrypted === null ? null : this.encryption.decrypt(encrypted);
  }

  /**
   * Refuses to flip `isEnabled` to true with an incomplete configuration
   * — enabling e-invoicing without a client id/secret/TIN would just
   * fail (unhelpfully, and later) once the submission engine exists.
   * Checks the incoming input first, falling back to what's already
   * stored for any field this update doesn't touch.
   */
  private async assertReadyToEnable(
    db: Kysely<TenantDatabase>,
    input: UpdateEtaCredentialsInput,
  ): Promise<void> {
    const current = await this.repository.getOrCreate(db);

    const clientId = input.clientId !== undefined ? input.clientId : current.clientId;
    const taxRegistrationNumber =
      input.taxRegistrationNumber !== undefined ? input.taxRegistrationNumber : current.taxRegistrationNumber;
    const hasSecret = input.clientSecret !== undefined ? input.clientSecret !== null : current.clientSecretConfigured;

    const missing: string[] = [];
    if (!clientId) missing.push('clientId');
    if (!hasSecret) missing.push('clientSecret');
    if (!taxRegistrationNumber) missing.push('taxRegistrationNumber');

    if (missing.length > 0) {
      throw new BusinessRuleError(
        `Cannot enable ETA e-invoicing: missing ${missing.join(', ')}.`,
      );
    }
  }
}
