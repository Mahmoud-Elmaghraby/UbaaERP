import { z } from 'zod';

/**
 * Item movement analysis (GET /inventory-reports/movement-analysis): what sold in the period,
 * what is sitting on the shelf, and when each item last sold — best sellers and slow movers.
 */
export const movementAnalysisRowSchema = z.object({
  productVariantId: z.string().uuid(),
  productId: z.string().uuid(),
  productName: z.string(),
  productCode: z.string(),
  sku: z.string(),
  /** Option values (size, colour…). */
  attributeValues: z.record(z.unknown()),
  categoryName: z.string().nullable(),
  /** Now, in the chosen warehouse (or all). */
  onHand: z.number(),
  /** Stock value now, company currency minor units; null without inventory.costs.view. */
  stockValueMinorUnits: z.string().nullable(),
  /** Base units sold in the period (deliveries − sales returns). */
  soldQuantity: z.number(),
  /** Cost of what sold in the period; null without inventory.costs.view. */
  soldCostMinorUnits: z.string().nullable(),
  /** Base units received from suppliers in the period. */
  receivedQuantity: z.number(),
  /** Last delivery up to the period end (YYYY-MM-DD), ever — null = never sold. */
  lastSaleDate: z.string().nullable(),
  lastMovementDate: z.string().nullable(),
});
export type MovementAnalysisRowDto = z.infer<typeof movementAnalysisRowSchema>;
