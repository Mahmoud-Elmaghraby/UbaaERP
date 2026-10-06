import { z } from 'zod';

/**
 * Wire representation of the Money Value Object (@erp-platform/shared-kernel,
 * CLAUDE.md §2.5). amountMinorUnits is a string, not a number — a bigint
 * can exceed Number.MAX_SAFE_INTEGER, and this contract must never silently
 * round-trip a monetary amount through a JS float.
 */
export const moneySchema = z.object({
  amountMinorUnits: z.string().regex(/^-?\d+$/, 'amountMinorUnits must be an integer string'),
  currency: z
    .string()
    .regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
});
export type MoneyDto = z.infer<typeof moneySchema>;

/** Input price/cost that can't be negative (a default sale or purchase price). */
export const nonNegativeMoneySchema = z.object({
  amountMinorUnits: z.string().regex(/^\d+$/, 'amountMinorUnits must be a non-negative integer string'),
  currency: z.string().regex(/^[A-Z]{3}$/, 'currency must be a three-letter ISO 4217 code'),
});
