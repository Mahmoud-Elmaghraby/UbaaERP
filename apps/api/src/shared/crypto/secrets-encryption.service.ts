import { Injectable } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH_BYTES = 12; // 96-bit nonce, the recommended size for GCM.
const KEY_LENGTH_BYTES = 32; // AES-256.

/**
 * Encrypts/decrypts small secrets (API client secrets, future signing
 * keys, etc.) before they're stored in a tenant schema column.
 *
 * Not a general-purpose crypto library — deliberately narrow: one
 * algorithm (AES-256-GCM, authenticated so tampering is detected, not
 * just confidentiality), one key, one string in/string out shape. First
 * consumer is Sales' `eta_credentials.client_secret` (CLAUDE.md §8's
 * mandatory e-invoice integration — see claude/sales-einvoice-spike.md,
 * "Decisions needed from the user" #3), but this lives under
 * apps/api/src/shared/ (next to shared/outbox/, shared/tenancy/), not
 * inside the Sales module, because it's a genuinely cross-module
 * concern: any future secret (a WhatsApp integration token flagged as a
 * research candidate in CLAUDE.md §17.4, an Accounting bank-feed API
 * key, etc.) will need the exact same treatment.
 *
 * Key management is intentionally minimal for now: a single symmetric
 * key from SECRETS_ENCRYPTION_KEY (32 raw bytes, base64-encoded). This
 * is a pragmatic MVP choice, not a final decision — CLAUDE.md §12 lists
 * production hosting as deliberately deferred, and a real KMS (cloud
 * provider–managed key, envelope encryption, rotation) is the natural
 * replacement once that hosting decision is made. Flagging here rather
 * than blocking on that deferred decision, per the same "ship the
 * essential version first" principle as §17.2.4.
 *
 * Deliberately NOT validated eagerly at module-load time (unlike
 * AuthInfraModule's `mustGetAccessSecret()`, which throws at boot
 * because every request needs it): SECRETS_ENCRYPTION_KEY is only
 * needed once a tenant actually stores a secret (e.g. configures ETA
 * credentials), which may never happen for a given deployment. Failing
 * fast here would mean the whole API refuses to boot over a feature a
 * tenant hasn't touched yet — the check happens lazily, on first actual
 * use, instead.
 */
@Injectable()
export class SecretsEncryptionService {
  private cachedKey: Buffer | null = null;

  private getKey(): Buffer {
    if (this.cachedKey) return this.cachedKey;

    const raw = process.env.SECRETS_ENCRYPTION_KEY;
    if (!raw) {
      throw new Error(
        'SECRETS_ENCRYPTION_KEY is not set. Required before any secret (e.g. ETA e-invoice credentials) can be stored or read.',
      );
    }

    const key = Buffer.from(raw, 'base64');
    if (key.length !== KEY_LENGTH_BYTES) {
      throw new Error(
        `SECRETS_ENCRYPTION_KEY must decode (as base64) to exactly ${KEY_LENGTH_BYTES} bytes for AES-256-GCM; got ${key.length}.`,
      );
    }

    this.cachedKey = key;
    return key;
  }

  /**
   * Encrypts `plaintext`, returning a single base64 string encoding
   * `iv || authTag || ciphertext` — self-contained, so no separate
   * column is needed to store the IV.
   */
  encrypt(plaintext: string): string {
    const key = this.getKey();
    const iv = randomBytes(IV_LENGTH_BYTES);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return Buffer.concat([iv, authTag, ciphertext]).toString('base64');
  }

  /**
   * Reverses `encrypt()`. Throws (GCM auth-tag check fails) if the
   * ciphertext was tampered with or the wrong key is in use — never
   * silently returns corrupted plaintext.
   */
  decrypt(encoded: string): string {
    const key = this.getKey();
    const buffer = Buffer.from(encoded, 'base64');
    const iv = buffer.subarray(0, IV_LENGTH_BYTES);
    const authTag = buffer.subarray(IV_LENGTH_BYTES, IV_LENGTH_BYTES + 16);
    const ciphertext = buffer.subarray(IV_LENGTH_BYTES + 16);

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return plaintext.toString('utf8');
  }
}
