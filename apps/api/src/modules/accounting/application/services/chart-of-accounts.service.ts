import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { CHART_OF_ACCOUNT_REPOSITORY, type ChartOfAccountRepository } from '../ports/chart-of-account.repository';
import type {
  ChartOfAccount,
  ChartOfAccountFilters,
  CreateChartOfAccountInput,
  UpdateChartOfAccountInput,
} from '../../domain/chart-of-account.entity';
import { BusinessRuleError, isPostgresForeignKeyViolation, isPostgresUniqueViolation } from '../errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Chart of accounts (CLAUDE.md §10 — step 5, Accounting, Stage 1). See
 * migration 0048_create_chart_of_accounts for the full tree-shape
 * reasoning (is_group/is_system/normal_balance).
 */
@Injectable()
export class ChartOfAccountsService {
  constructor(@Inject(CHART_OF_ACCOUNT_REPOSITORY) private readonly repository: ChartOfAccountRepository) {}

  list(db: Kysely<TenantDatabase>, filters?: ChartOfAccountFilters): Promise<ChartOfAccount[]> {
    return this.repository.list(db, filters);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<ChartOfAccount> {
    const account = await this.repository.findById(db, id);
    if (!account) throw entityNotFound('CHART_OF_ACCOUNT', id);
    return account;
  }

  async create(db: Kysely<TenantDatabase>, input: CreateChartOfAccountInput): Promise<ChartOfAccount> {
    if (input.parentId) {
      const parent = await this.repository.findById(db, input.parentId);
      if (!parent) throw entityNotFound('CHART_OF_ACCOUNT', input.parentId);
      if (!parent.isGroup) {
        throw new BusinessRuleError(
          `"${parent.code} — ${parent.name}" is not a group account and cannot have child accounts.`,
          { code: 'CHART_OF_ACCOUNT.PARENT_NOT_GROUP', params: { code: parent.code, name: parent.name } },
        );
      }
    }

    try {
      return await this.repository.create(db, input);
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('CHART_OF_ACCOUNT', 'code', input.code);
      }
      throw err;
    }
  }

  async update(db: Kysely<TenantDatabase>, id: string, input: UpdateChartOfAccountInput): Promise<ChartOfAccount> {
    const existing = await this.getById(db, id);
    if (existing.isSystem && input.isActive === false) {
      throw new BusinessRuleError(
        `"${existing.code} — ${existing.name}" is one of the five root accounts and cannot be deactivated.`,
        { code: 'CHART_OF_ACCOUNT.CANNOT_DEACTIVATE_ROOT', params: { code: existing.code, name: existing.name } },
      );
    }

    try {
      const updated = await this.repository.update(db, id, input);
      if (!updated) throw entityNotFound('CHART_OF_ACCOUNT', id);
      return updated;
    } catch (err) {
      if (isPostgresUniqueViolation(err)) {
        throw duplicateEntity('CHART_OF_ACCOUNT', 'code', input.code);
      }
      throw err;
    }
  }

  async delete(db: Kysely<TenantDatabase>, id: string): Promise<void> {
    const existing = await this.getById(db, id);
    if (existing.isSystem) {
      throw new BusinessRuleError(`"${existing.code} — ${existing.name}" is a root account and cannot be deleted.`, {
        code: 'CHART_OF_ACCOUNT.CANNOT_DELETE_ROOT',
        params: { code: existing.code, name: existing.name },
      });
    }
    if (existing.isGroup) {
      const children = await this.repository.listChildren(db, id);
      if (children.length > 0) {
        throw new BusinessRuleError(
          `"${existing.code} — ${existing.name}" still has ${children.length} child account(s) — move or delete them first.`,
          {
            code: 'CHART_OF_ACCOUNT.HAS_CHILD_ACCOUNTS',
            params: { code: existing.code, name: existing.name, count: children.length },
          },
        );
      }
    }

    // NOTE for Stage 2 (Journal Entries, not yet built): once
    // journal_entry_lines exists, add a check here that this account has
    // never been posted to — mirroring how every other module guards
    // deletion of a still-referenced row. Not enforceable yet, the table
    // doesn't exist in this stage; the FK-violation catch below is the
    // interim safety net (parent_id already has ON DELETE RESTRICT).
    let deleted: boolean;
    try {
      deleted = await this.repository.delete(db, id);
    } catch (err) {
      if (isPostgresForeignKeyViolation(err)) {
        throw new BusinessRuleError(
          `"${existing.code} — ${existing.name}" is referenced elsewhere and cannot be deleted.`,
          { code: 'CHART_OF_ACCOUNT.REFERENCED_ELSEWHERE', params: { code: existing.code, name: existing.name } },
        );
      }
      throw err;
    }
    if (!deleted) throw entityNotFound('CHART_OF_ACCOUNT', id);
  }

  /**
   * Forward-compatible plumbing for Stage 2 (Journal Entries): only a
   * leaf (non-group), active account can receive a posting. Exposed now
   * so the future JournalEntriesService just calls this instead of
   * re-deriving the rule.
   */
  async assertPostable(db: Kysely<TenantDatabase>, accountId: string): Promise<ChartOfAccount> {
    const account = await this.getById(db, accountId);
    if (account.isGroup) {
      throw new BusinessRuleError(
        `"${account.code} — ${account.name}" is a group account (a folder in the chart of accounts) and ` +
          'cannot be posted to directly — post to one of its sub-accounts instead.',
        { code: 'CHART_OF_ACCOUNT.CANNOT_POST_TO_GROUP', params: { code: account.code, name: account.name } },
      );
    }
    if (!account.isActive) {
      throw new BusinessRuleError(`"${account.code} — ${account.name}" is inactive and cannot be posted to.`, {
        code: 'CHART_OF_ACCOUNT.INACTIVE',
        params: { code: account.code, name: account.name },
      });
    }
    return account;
  }
}
