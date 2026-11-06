/**
 * Re-checks a document's quantities against what its source lines still
 * allow, in BASE units (quantity × unit factor) so a line in cartons and one
 * in pieces against the same order line add up correctly. Used at
 * confirm/post time, under a row lock on the source lines (see
 * lockRowsForUpdate), so two drafts can't both use up the same remainder.
 */

const EPSILON = 1e-6;

export interface RequestedQuantity {
  /** The source line this document line draws from (purchase order line / goods receipt line). */
  sourceLineId: string;
  quantity: number;
  unitFactor: number;
}

export interface QuantityExcess {
  sourceLineId: string;
  /** What this document asks for on that source line, in base units (all of its lines together). */
  requestedBase: number;
  /** Ordered / received on the source line, in base units. */
  limitBase: number;
  /** Already used by confirmed/posted documents, in base units. */
  usedBase: number;
  /** limitBase − usedBase (never below 0). */
  remainingBase: number;
}

export function toBaseQuantity(quantity: number, unitFactor: number): number {
  return Math.round(quantity * unitFactor * 10_000) / 10_000;
}

/**
 * The first source line this document would push past its limit, or null.
 * A source line missing from `limitBase` counts as a limit of 0.
 */
export function findQuantityExcess(
  requested: readonly RequestedQuantity[],
  limitBase: ReadonlyMap<string, number>,
  usedBase: Readonly<Record<string, number>>,
): QuantityExcess | null {
  const requestedBase = new Map<string, number>();
  for (const line of requested) {
    requestedBase.set(
      line.sourceLineId,
      toBaseQuantity((requestedBase.get(line.sourceLineId) ?? 0) + toBaseQuantity(line.quantity, line.unitFactor), 1),
    );
  }
  for (const [sourceLineId, wanted] of requestedBase) {
    const limit = limitBase.get(sourceLineId) ?? 0;
    const used = usedBase[sourceLineId] ?? 0;
    if (used + wanted > limit + EPSILON) {
      return {
        sourceLineId,
        requestedBase: wanted,
        limitBase: limit,
        usedBase: used,
        remainingBase: Math.max(0, toBaseQuantity(limit - used, 1)),
      };
    }
  }
  return null;
}

/** A base quantity shown in the source line's own unit (for error messages). */
export function inLineUnit(baseQuantity: number, unitFactor: number): number {
  return unitFactor > 0 ? Math.round((baseQuantity / unitFactor) * 10_000) / 10_000 : baseQuantity;
}
