import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { TAX_RULE_REPOSITORY, type TaxRuleRepository } from '../ports/tax-rule.repository';
import type { CreateTaxRuleInput, TaxRule, UpdateTaxRuleInput } from '../../domain/tax-rule.entity';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

@Injectable()
export class TaxRulesService {
  constructor(@Inject(TAX_RULE_REPOSITORY) private readonly repository: TaxRuleRepository) {}

  list(db: Kysely<TenantDatabase>): Promise<TaxRule[]> {
    return this.repository.list(db);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<TaxRule> {
    const rule = await this.repository.findById(db, id);
    if (!rule) throw entityNotFound('TAX_RULE', id);
    return rule;
  }

  create(db: Kysely<TenantDatabase>, input: CreateTaxRuleInput): Promise<TaxRule> {
    return this.repository.create(db, input);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateTaxRuleInput): Promise<TaxRule> {
    const updated = await this.repository.update(db, id, input);
    if (!updated) throw entityNotFound('TAX_RULE', id);
    return updated;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const deleted = await this.repository.delete(db, id);
    if (!deleted) throw entityNotFound('TAX_RULE', id);
  }
}
