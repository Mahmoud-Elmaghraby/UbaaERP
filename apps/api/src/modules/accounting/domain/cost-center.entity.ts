/**
 * Cost center (CLAUDE.md §10 — step 5, Accounting, Stage 4). See
 * migration 0055's own comment — a flat tagging dimension, deliberately
 * not a tree like ChartOfAccount.
 */
export interface CostCenter {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  notes: string | null;
  customFields: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateCostCenterInput {
  code: string;
  name: string;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface UpdateCostCenterInput {
  code?: string;
  name?: string;
  isActive?: boolean;
  notes?: string | null;
  customFields?: Record<string, unknown>;
}

export interface CostCenterFilters {
  isActive?: boolean;
}
