import type { TaxKind } from '@erp-platform/shared-kernel';

export type { TaxKind };
export type TaxRuleScope = 'sales' | 'purchases' | 'both';

export interface TaxRule {
  id: string;
  name: string;
  /** Percentage, e.g. 14 for Egyptian VAT — NOT the Money VO (CLAUDE.md §2.5). */
  rate: number;
  isActive: boolean;
  /** Migration 0091: how the invoice tax engine applies it (shared-kernel tax-calculator). */
  kind: TaxKind;
  etaType: string | null;
  etaSubtype: string | null;
  scope: TaxRuleScope;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTaxRuleInput {
  name: string;
  rate: number;
  isActive?: boolean;
  kind?: TaxKind;
  etaType?: string | null;
  etaSubtype?: string | null;
  scope?: TaxRuleScope;
}

export interface UpdateTaxRuleInput {
  name?: string;
  rate?: number;
  isActive?: boolean;
  kind?: TaxKind;
  etaType?: string | null;
  etaSubtype?: string | null;
  scope?: TaxRuleScope;
}
