import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { CreateTaxRuleInput, TaxRule, UpdateTaxRuleInput } from '../../domain/tax-rule.entity';

export interface TaxRuleRepository {
  list(db: Kysely<TenantDatabase>): Promise<TaxRule[]>;
  findById(db: Kysely<TenantDatabase>, id: string): Promise<TaxRule | null>;
  create(db: Kysely<TenantDatabase>, input: CreateTaxRuleInput): Promise<TaxRule>;
  update(db: Kysely<TenantDatabase>, id: string, input: UpdateTaxRuleInput): Promise<TaxRule | null>;
  delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean>;
}

export const TAX_RULE_REPOSITORY = Symbol('TAX_RULE_REPOSITORY');
