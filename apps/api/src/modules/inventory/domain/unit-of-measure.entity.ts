export interface UnitOfMeasure {
  id: string;
  name: string;
  symbol: string;
  /** null = this unit IS a base unit. Otherwise, the base unit it converts against (one level deep only). */
  baseUnitId: string | null;
  /** 1 of this unit = conversionFactor × 1 of its base unit. Meaningless (always 1) when baseUnitId is null. */
  conversionFactor: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateUnitOfMeasureInput {
  name: string;
  symbol: string;
  baseUnitId?: string | null;
  conversionFactor?: number;
  isActive?: boolean;
}

export interface UpdateUnitOfMeasureInput {
  name?: string;
  symbol?: string;
  baseUnitId?: string | null;
  conversionFactor?: number;
  isActive?: boolean;
}

/**
 * Converts a quantity between two units that share the same base (one of
 * them may itself be the shared base). Only one conversion "hop" is ever
 * needed since chains longer than one level aren't allowed
 * (UnitsOfMeasureService enforces that on write).
 */
export function convertUnitQuantity(from: UnitOfMeasure, to: UnitOfMeasure, quantity: number): number {
  if (from.id === to.id) return quantity;

  const fromBaseId = from.baseUnitId ?? from.id;
  const toBaseId = to.baseUnitId ?? to.id;
  if (fromBaseId !== toBaseId) {
    throw new Error(
      `Cannot convert between "${from.symbol}" and "${to.symbol}": they don't share a common base unit.`,
    );
  }

  // Normalize to the shared base, then to the target unit.
  const quantityInBase = from.baseUnitId ? quantity * from.conversionFactor : quantity;
  return to.baseUnitId ? quantityInBase / to.conversionFactor : quantityInBase;
}
