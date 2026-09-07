import { createHmac, randomBytes } from 'node:crypto';
import { Injectable } from '@nestjs/common';

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const SECRET_BYTES = 20; // 160 bits — the RFC 4226/6238-recommended HMAC-SHA1 key size.
const TOTP_STEP_SECONDS = 30;
const TOTP_DIGITS = 6;
const DEFAULT_WINDOW = 1; // tolerate +/-1 step (+/-30s) of clock drift, same as most authenticator apps.

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(encoded: string): Buffer {
  const clean = encoded.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const idx = BASE32_ALPHABET.indexOf(char);
    if (idx === -1) continue;
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** RFC 4226 HOTP: HMAC-SHA1 over an 8-byte big-endian counter, then the
 * "dynamic truncation" scheme that turns the 20-byte HMAC digest into a
 * 6-digit code. */
function hotp(secretBytes: Buffer, counter: number): string {
  const counterBuffer = Buffer.alloc(8);
  // Counter is a 64-bit big-endian integer per the RFC. Node's Buffer only
  // exposes 32-bit writers, so the high 4 bytes are written separately
  // (always 0 here — no deployment runs long enough to overflow the low
  // 32 bits at one increment per 30 seconds).
  counterBuffer.writeUInt32BE(0, 0);
  counterBuffer.writeUInt32BE(counter, 4);

  const hmac = createHmac('sha1', secretBytes).update(counterBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binCode =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  return String(binCode % 10 ** TOTP_DIGITS).padStart(TOTP_DIGITS, '0');
}

/**
 * RFC 6238 TOTP (RFC 4226 HOTP + a time-derived counter), implemented
 * directly on Node's built-in `crypto` rather than pulling in a
 * third-party authenticator library — CLAUDE.md §12 asks new
 * dependencies to be justified, and TOTP is a small, stable, fully
 * specified algorithm with a public test vector (RFC 6238 Appendix B,
 * used directly in this file's spec) to verify against, so there is
 * little "getting it subtly wrong" surface once implemented against it.
 *
 * SHA-1 is used deliberately, not because it is cryptographically
 * strong by today's standards, but because it is what every mainstream
 * authenticator app (Google Authenticator, Authy, 1Password, Microsoft
 * Authenticator, etc.) still expects by default for TOTP — a
 * compatibility choice, not a weakened-security one: the shared secret
 * itself (20 random bytes, encrypted at rest via SecretsEncryptionService,
 * see TwoFactorService) is what actually needs to stay confidential, not
 * the hash function's collision resistance.
 */
@Injectable()
export class TotpService {
  generateSecret(): string {
    return base32Encode(randomBytes(SECRET_BYTES));
  }

  /** `otpauth://` URI most authenticator apps can import directly (by
   * scanning a QR code built from it, or by manual entry of `secret`
   * alone — this codebase does not render a QR image itself, see
   * two-factor-card.tsx's comment on why). */
  buildOtpauthUri(secret: string, accountLabel: string, issuer = 'ERP Platform'): string {
    const encodedIssuer = encodeURIComponent(issuer);
    const encodedLabel = encodeURIComponent(`${issuer}:${accountLabel}`);
    return `otpauth://totp/${encodedLabel}?secret=${secret}&issuer=${encodedIssuer}&algorithm=SHA1&digits=${TOTP_DIGITS}&period=${TOTP_STEP_SECONDS}`;
  }

  /** Accepts a code from the current 30s step or up to `window` steps of
   * drift on either side — the same tolerance every mainstream
   * authenticator app's own server-side counterpart already applies. */
  verifyCode(secret: string, code: string, window = DEFAULT_WINDOW): boolean {
    const trimmed = code.trim();
    if (!/^\d{6}$/.test(trimmed)) return false;

    const secretBytes = base32Decode(secret);
    const counter = Math.floor(Date.now() / 1000 / TOTP_STEP_SECONDS);

    for (let drift = -window; drift <= window; drift++) {
      if (hotp(secretBytes, counter + drift) === trimmed) return true;
    }
    return false;
  }
}
