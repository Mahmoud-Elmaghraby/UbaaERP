/**
 * Tree rules shared by the department tree (parent) and the reporting line (manager).
 * Pure: the caller loads the current links (id → parent id) once.
 */

/**
 * Would pointing `id` at `newParentId` close a loop? True when `newParentId` is `id` itself or one
 * of its descendants — walking up from `newParentId` reaches `id`.
 */
export function wouldCreateCycle(id: string, newParentId: string | null, parentOf: ReadonlyMap<string, string | null>): boolean {
  const seen = new Set<string>();
  let current: string | null = newParentId;
  while (current) {
    if (current === id) return true;
    if (seen.has(current)) return false; // an existing loop elsewhere — not ours to judge here
    seen.add(current);
    current = parentOf.get(current) ?? null;
  }
  return false;
}
