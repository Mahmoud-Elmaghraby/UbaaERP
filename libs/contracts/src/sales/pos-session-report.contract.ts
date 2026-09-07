import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';
import { paymentMethodSchema } from './payment-received.contract';
import { posSessionSchema } from './pos-session.contract';

/**
 * POS Session Report — X Report (session still 'open') / Z Report (session
 * 'closed'), Stage 5 (claude/sales-pos-research.md). Same shape for both: see
 * `PosSessionReport`'s own doc comment (pos-session.entity.ts) for exactly what
 * differs between the two states (expectedCashAmount live vs stored,
 * countedCashAmount/varianceAmount null until closed).
 */
export const posSessionTenderTotalSchema = z.object({
  paymentMethod: paymentMethodSchema,
  amount: moneySchema,
});
export type PosSessionTenderTotalDto = z.infer<typeof posSessionTenderTotalSchema>;

export const posSessionReportSchema = z.object({
  session: posSessionSchema,
  /** Number of DISTINCT sales made during this session — never the number of payment rows (split-tender writes several per sale). */
  salesCount: z.number().int().nonnegative(),
  totalSalesAmount: moneySchema,
  tendersByMethod: z.array(posSessionTenderTotalSchema),
  expectedCashAmount: moneySchema,
  countedCashAmount: moneySchema.nullable(),
  varianceAmount: moneySchema.nullable(),
  generatedAt: z.coerce.date(),
});
export type PosSessionReportDto = z.infer<typeof posSessionReportSchema>;
