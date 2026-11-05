import { evaluateCreditLimit, parseCreditLimitMode, type CreditCheckInput } from './customer-credit';

const base: CreditCheckInput = { mode: 'block', limitMinor: 100_000n, balanceMinor: 60_000n, amountMinor: 30_000n, canOverride: false };

describe('evaluateCreditLimit', () => {
  it('adds the new document to the current balance', () => {
    const r = evaluateCreditLimit(base);
    expect(r).toEqual({ exposureMinor: 90_000n, exceeded: false, blocked: false });
  });

  it('allows exposure exactly at the limit', () => {
    expect(evaluateCreditLimit({ ...base, amountMinor: 40_000n }).exceeded).toBe(false);
  });

  it('blocks above the limit in block mode', () => {
    expect(evaluateCreditLimit({ ...base, amountMinor: 40_001n })).toEqual({ exposureMinor: 100_001n, exceeded: true, blocked: true });
  });

  it('lets a user with the override permission through', () => {
    const r = evaluateCreditLimit({ ...base, amountMinor: 50_000n, canOverride: true });
    expect(r.exceeded).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('only warns in warn mode', () => {
    const r = evaluateCreditLimit({ ...base, mode: 'warn', amountMinor: 50_000n });
    expect(r.exceeded).toBe(true);
    expect(r.blocked).toBe(false);
  });

  it('never flags in off mode or without a limit', () => {
    expect(evaluateCreditLimit({ ...base, mode: 'off', amountMinor: 500_000n }).exceeded).toBe(false);
    expect(evaluateCreditLimit({ ...base, limitMinor: null, amountMinor: 500_000n }).exceeded).toBe(false);
  });

  it('treats a zero limit as cash-only and a credit balance as headroom', () => {
    expect(evaluateCreditLimit({ ...base, limitMinor: 0n, balanceMinor: 0n, amountMinor: 1n }).blocked).toBe(true);
    expect(evaluateCreditLimit({ ...base, balanceMinor: -20_000n, amountMinor: 110_000n }).exceeded).toBe(false);
  });

  it('flags a balance already above the limit even for a zero amount', () => {
    expect(evaluateCreditLimit({ ...base, balanceMinor: 120_000n, amountMinor: 0n }).exceeded).toBe(true);
  });
});

describe('parseCreditLimitMode', () => {
  it('falls back to off', () => {
    expect(parseCreditLimitMode('warn')).toBe('warn');
    expect(parseCreditLimitMode('block')).toBe('block');
    expect(parseCreditLimitMode('nonsense')).toBe('off');
    expect(parseCreditLimitMode(null)).toBe('off');
  });
});
