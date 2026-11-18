import type { Kysely } from 'kysely';
import type { JournalLineRulesDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { AccountingSettings } from '../../domain/accounting-settings.entity';
import type { CreateJournalEntryLineInput, JournalLineParties } from '../../domain/journal-entry.entity';
import { BusinessRuleError } from '../errors';
import { resolveTreasuryAccount } from './treasury-account-resolver';

/**
 * What a MANUAL journal line on a given account must carry (migration 0132), so hand-made entries
 * can't pull the books away from the sub-ledgers they summarise:
 *
 *  - customer / supplier / employee: the Customers (AR), Suppliers (AP), employee advances and
 *    salaries-payable accounts — the line names the party and shows on its statement;
 *  - treasury: an account a treasury posts to — the line names the treasury and moves its balance
 *    (only a treasury in the company currency: entries are always in it);
 *  - locked: accounts only documents may move — أوراق القبض / الدفع (the cheque cycle), inventory
 *    (stock adjustments) and goods received not invoiced (receipts and invoices).
 *
 * Automatic entries are never checked: their source document already carries the party.
 */
export type LineRuleKind = 'customer' | 'supplier' | 'employee' | 'treasury' | 'locked';

export interface LineRule {
  kind: LineRuleKind;
  /** kind 'treasury': the treasuries whose money sits in this account. Empty = none (no treasury to name). */
  treasuries: { id: string; name: string; currency: string }[];
}

export async function loadLineRules(
  db: Kysely<TenantDatabase>,
  settings: AccountingSettings,
): Promise<Map<string, LineRule>> {
  const rules = new Map<string, LineRule>();
  const put = (accountId: string | null, kind: LineRuleKind) => {
    if (accountId && !rules.has(accountId)) rules.set(accountId, { kind, treasuries: [] });
  };
  // Order matters: an account mapped twice takes the first (strictest) rule.
  put(settings.notesReceivableAccountId, 'locked');
  put(settings.notesPayableAccountId, 'locked');
  put(settings.inventoryAccountId, 'locked');
  put(settings.grniAccountId, 'locked');
  put(settings.accountsReceivableAccountId, 'customer');
  put(settings.accountsPayableAccountId, 'supplier');
  put(settings.employeeAdvancesAccountId, 'employee');
  put(settings.salariesPayableAccountId, 'employee');

  const treasuries = await db.selectFrom('treasuries').select(['id', 'name', 'currency', 'kind', 'chart_of_account_id']).orderBy('name').execute();
  for (const treasury of treasuries) {
    let accountId: string;
    try {
      accountId = await resolveTreasuryAccount(db, settings, { treasuryId: treasury.id });
    } catch {
      continue; // no cash / bank mapping yet — nothing posts there either
    }
    put(accountId, 'treasury');
    const rule = rules.get(accountId);
    if (rule?.kind === 'treasury') rule.treasuries.push({ id: treasury.id, name: treasury.name, currency: treasury.currency });
  }
  return rules;
}

export function rulesToDto(rules: Map<string, LineRule>): JournalLineRulesDto {
  return {
    accounts: [...rules.entries()].map(([accountId, rule]) => ({
      accountId,
      kind: rule.kind,
      treasuries: rule.treasuries,
    })),
  };
}

/**
 * Checks manual lines against the rules and returns each line's parties, cleaned: a party or
 * treasury given on an account that doesn't take one is dropped (it would otherwise show on a
 * statement it doesn't belong to).
 */
export async function applyLineRules(
  db: Kysely<TenantDatabase>,
  rules: Map<string, LineRule>,
  lines: Pick<CreateJournalEntryLineInput, 'accountId' | 'customerId' | 'supplierId' | 'employeeId' | 'treasuryId'>[],
  companyCurrency: string,
): Promise<JournalLineParties[]> {
  const out: JournalLineParties[] = [];
  for (const line of lines) {
    const none: JournalLineParties = { customerId: null, supplierId: null, employeeId: null, treasuryId: null };
    const rule = rules.get(line.accountId);
    if (!rule) {
      out.push(none);
      continue;
    }
    const account = () => accountLabel(db, line.accountId);
    switch (rule.kind) {
      case 'locked':
        throw new BusinessRuleError(`Account ${line.accountId} can only be moved by its documents, not by a manual entry.`, {
          code: 'JOURNAL_ENTRY.ACCOUNT_LOCKED',
          params: { account: await account() },
        });
      case 'customer':
      case 'supplier':
      case 'employee': {
        const id = rule.kind === 'customer' ? line.customerId : rule.kind === 'supplier' ? line.supplierId : line.employeeId;
        if (!id) {
          throw new BusinessRuleError(`A line on account ${line.accountId} needs a ${rule.kind}.`, {
            code: `JOURNAL_ENTRY.${rule.kind.toUpperCase()}_REQUIRED`,
            params: { account: await account() },
          });
        }
        const table = rule.kind === 'customer' ? 'customers' : rule.kind === 'supplier' ? 'suppliers' : 'employees';
        const exists = await db.selectFrom(table).select('id').where('id', '=', id).executeTakeFirst();
        if (!exists) throw new BusinessRuleError(`The ${rule.kind} on a journal line does not exist.`, { code: 'JOURNAL_ENTRY.PARTY_NOT_FOUND' });
        out.push({ ...none, [`${rule.kind}Id`]: id });
        break;
      }
      case 'treasury': {
        if (rule.treasuries.length === 0) {
          out.push(none);
          break;
        }
        const treasury = rule.treasuries.find((t) => t.id === line.treasuryId);
        if (!treasury) {
          throw new BusinessRuleError(`A line on account ${line.accountId} needs one of its treasuries.`, {
            code: 'JOURNAL_ENTRY.TREASURY_REQUIRED',
            params: { account: await account() },
          });
        }
        if (treasury.currency !== companyCurrency) {
          throw new BusinessRuleError(`Treasury "${treasury.name}" is in ${treasury.currency}; use a voucher for it.`, {
            code: 'JOURNAL_ENTRY.TREASURY_FOREIGN_CURRENCY',
            params: { treasury: treasury.name, currency: treasury.currency },
          });
        }
        out.push({ ...none, treasuryId: treasury.id });
        break;
      }
    }
  }
  return out;
}

async function accountLabel(db: Kysely<TenantDatabase>, accountId: string): Promise<string> {
  const row = await db.selectFrom('chart_of_accounts').select(['code', 'name']).where('id', '=', accountId).executeTakeFirst();
  return row ? `${row.code} — ${row.name}` : accountId;
}
