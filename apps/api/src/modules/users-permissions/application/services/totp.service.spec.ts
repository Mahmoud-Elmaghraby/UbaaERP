import { TotpService } from './totp.service';

// RFC 6238 Appendix B's test secret, ASCII "12345678901234567890" (20
// bytes), base32-encoded — the same secret every published TOTP test
// vector in the RFC uses. Verifying against these (rather than only a
// self-referential generate-then-verify round trip) checks the actual
// HOTP/TOTP algorithm, not just internal consistency.
const RFC_TEST_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';

function mockNowSeconds(unixSeconds: number): jest.SpyInstance {
  return jest.spyOn(Date, 'now').mockReturnValue(unixSeconds * 1000);
}

describe('TotpService', () => {
  let service: TotpService;

  beforeEach(() => {
    service = new TotpService();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('verifyCode() against RFC 6238 Appendix B test vectors', () => {
    // Table: [unix time, expected 6-digit code (last 6 digits of the
    // RFC's published 8-digit SHA1 value, since `code = binCode % 10^n`
    // truncates from the right regardless of n).
    const vectors: Array<[number, string]> = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
    ];

    it.each(vectors)('matches the published code at time=%d', (unixSeconds, expectedCode) => {
      mockNowSeconds(unixSeconds);
      expect(service.verifyCode(RFC_TEST_SECRET, expectedCode, 0)).toBe(true);
    });

    it('rejects a wrong code at a known time', () => {
      mockNowSeconds(59);
      expect(service.verifyCode(RFC_TEST_SECRET, '000000', 0)).toBe(false);
    });
  });

  describe('verifyCode() clock-drift tolerance', () => {
    // Anchor time 1111111109 (counter 37037036, code 081804 — one of the
    // RFC vectors above). The adjacent-step codes below were computed
    // the same way (RFC 4226 HOTP against RFC_TEST_SECRET), independently
    // of this service's own implementation, for the exact same reason
    // the vectors above are: this tests the algorithm, not just internal
    // round-trip consistency.
    const ANCHOR_TIME = 1111111109;
    const oneStepEarlierCode = '731029'; // time - 30s
    const twoStepsEarlierCode = '150727'; // time - 60s
    const oneStepLaterCode = '050471'; // time + 30s
    const twoStepsLaterCode = '266759'; // time + 60s

    it('accepts a code from one step in the past within the default window', () => {
      mockNowSeconds(ANCHOR_TIME);
      expect(service.verifyCode(RFC_TEST_SECRET, oneStepEarlierCode, 1)).toBe(true);
    });

    it('accepts a code from one step in the future within the default window', () => {
      mockNowSeconds(ANCHOR_TIME);
      expect(service.verifyCode(RFC_TEST_SECRET, oneStepLaterCode, 1)).toBe(true);
    });

    it('rejects a code from two steps in the past, outside the default window', () => {
      mockNowSeconds(ANCHOR_TIME);
      expect(service.verifyCode(RFC_TEST_SECRET, twoStepsEarlierCode, 1)).toBe(false);
    });

    it('rejects a code from two steps in the future, outside the default window', () => {
      mockNowSeconds(ANCHOR_TIME);
      expect(service.verifyCode(RFC_TEST_SECRET, twoStepsLaterCode, 1)).toBe(false);
    });

    it('rejects one-step-away codes when called with an explicit zero window', () => {
      mockNowSeconds(ANCHOR_TIME);
      expect(service.verifyCode(RFC_TEST_SECRET, oneStepEarlierCode, 0)).toBe(false);
      expect(service.verifyCode(RFC_TEST_SECRET, oneStepLaterCode, 0)).toBe(false);
    });
  });

  describe('generateSecret() + buildOtpauthUri()', () => {
    it('generates a base32 secret of the expected shape', () => {
      const secret = service.generateSecret();
      // 20 random bytes base32-encode to 32 characters with no padding
      // (160 bits / 5 bits-per-char = exactly 32, no remainder).
      expect(secret).toMatch(/^[A-Z2-7]{32}$/);
    });

    it('generates a different secret each call', () => {
      expect(service.generateSecret()).not.toBe(service.generateSecret());
    });

    it('builds an otpauth:// URI carrying the secret, issuer, and account label', () => {
      const uri = service.buildOtpauthUri('ABCDEFGHIJKLMNOP', 'owner@example.com', 'Acme ERP');
      expect(uri).toMatch(/^otpauth:\/\/totp\//);
      expect(uri).toContain('secret=ABCDEFGHIJKLMNOP');
      expect(uri).toContain('issuer=Acme%20ERP');
      expect(uri).toContain(encodeURIComponent('Acme ERP:owner@example.com'));
    });
  });
});
