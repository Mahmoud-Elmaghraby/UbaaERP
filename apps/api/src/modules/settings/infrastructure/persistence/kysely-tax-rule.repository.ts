import { randomUUID } from 'node:crypto';
import { sql } from 'kysely';
import type { Kysely, Selectable } from 'kysely';
import type { TaxRulesTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { TaxRuleRepository } from '../../application/ports/tax-rule.repository';
import type {
  CreateTaxRuleInput,
  TaxKind,
  TaxRule,
  TaxRuleScope,
  UpdateTaxRuleInput,
} from '../../domain/tax-rule.entity';

// pg returns NUMERIC columns as strings (to avoid float precision loss) —
// TaxRulesTable.rate is typed `string` for that reason; the domain entity
// exposes it as `number`, converted here at the infrastructure boundary.
function toDomain(row: Selectable<TaxRulesTable>): TaxRule {
  return {
    id: row.id,
    name: row.name,
    rate: Number(row.rate),
    isActive: row.is_active,
    kind: row.kind as TaxKind,
    etaType: row.eta_type,
    etaSubtype: row.eta_subtype,
    scope: row.scope as TaxRuleScope,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export class KyselyTaxRuleRepository implements TaxRuleRepository {
  async list(db: Kysely<TenantDatabase>): Promise<TaxRule[]> {
    const rows = await db.selectFrom('tax_rules').selectAll().orderBy('name').execute();
    return rows.map(toDomain);
  }

  async findById(db: Kysely<TenantDatabase>, id: string): Promise<TaxRule | null> {
    const row = await db.selectFrom('tax_rules').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateTaxRuleInput): Promise<TaxRule> {
    const row = await db
      .insertInto('tax_rules')
      .values({
        id: randomUUID(),
        name: input.name,
        rate: String(input.rate),
        is_active: input.isActive ?? true,
        kind: input.kind ?? 'vat',
        eta_type: input.etaType ?? null,
        eta_subtype: input.etaSubtype ?? null,
        scope: input.scope ?? 'both',
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateTaxRuleInput): Promise<TaxRule | null> {
    const row = await db
      .updateTable('tax_rules')
      .set({
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.rate !== undefined ? { rate: String(input.rate) } : {}),
        ...(input.isActive !== undefined ? { is_active: input.isActive } : {}),
        ...(input.kind !== undefined ? { kind: input.kind } : {}),
        ...(input.etaType !== undefined ? { eta_type: input.etaType } : {}),
        ...(input.etaSubtype !== undefined ? { eta_subtype: input.etaSubtype } : {}),
        ...(input.scope !== undefined ? { scope: input.scope } : {}),
        updated_at: sql`now()`,
      })
      .where('id', '=', id)
      .returningAll()
      .executeTakeFirst();
    return row ? toDomain(row) : null;
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<boolean> {
    const result = await db.deleteFrom('tax_rules').where('id', '=', id).executeTakeFirst();
    return result.numDeletedRows > 0n;
  }
}
