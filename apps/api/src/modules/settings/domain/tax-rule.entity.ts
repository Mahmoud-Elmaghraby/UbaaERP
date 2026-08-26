export interface TaxRule {
  id: string;
  name: string;
  /** Percentage, e.g. 14 for Egyptian VAT — NOT the Money VO (CLAUDE.md §2.5). */
  rate: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxRuleInput {
  name: string;
  rate: number;
  isActive?: boolean;
}

export interface UpdateTaxRuleInput {
  name?: string;
  rate?: number;
  isActive?: boolean;
}
