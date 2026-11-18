import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { LedgerIntegrityReportDto, LedgerIntegrityRowDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { companyCurrency, LedgerCheckRegistry, type LedgerCheckRow } from '../../../../shared/integrity/ledger-checks';
import { AccountingSettingsService } from './accounting-settings.service';
import { resolveTreasuryAccount } from './treasury-account-resolver';

const MAX_LISTED = 15;

interface Group {
  key: LedgerCheckRow['key'];
  accountId: string | null;
  labels: string[];
  side: LedgerCheckRow['side'];
  subledgerMinor: bigint;
  foreignExcluded: number;
  lineColumn: LedgerCheckRow['lineColumn'];
  includesJournalLines: boolean;
  link: string | null;
}

/**
 * "فحص سلامة البيانات" (project doc journal-line-parties-2026-11-18): each control account's
 * balance in the books against what its sub-ledger says right now — customers, suppliers, cheques,
 * every treasury, stock value, employee loans, unpaid salaries. A difference means an entry is
 * missing or extra somewhere; the manual lines that name no party are listed as the likely cause.
 */
@Injectable()
export class LedgerIntegrityService {
  constructor(
    private readonly registry: LedgerCheckRegistry,
    private readonly accountingSettings: AccountingSettingsService,
  ) {}

  async report(db: Kysely<TenantDatabase>): Promise<LedgerIntegrityReportDto> {
    const [settings, checks, currency] = await Promise.all([
      this.accountingSettings.get(db),
      this.registry.list(db),
      companyCurrency(db),
    ]);

    // Treasuries sharing one account (e.g. several cash boxes on the cash mapping) are one row.
    const groups = new Map<string, Group>();
    for (const check of checks) {
      let accountId: string | null;
      if ('treasuryId' in check.account) {
        try {
          accountId = await resolveTreasuryAccount(db, settings, { treasuryId: check.account.treasuryId });
        } catch {
          accountId = null;
        }
      } else {
        accountId = settings[check.account.setting] ?? null;
      }
      const id = `${check.key}:${accountId ?? check.label ?? ''}`;
      const group = groups.get(id);
      if (group) {
        group.subledgerMinor += check.subledgerMinor;
        group.foreignExcluded += check.foreignExcluded;
        if (check.label) group.labels.push(check.label);
        if (group.link !== check.link) group.link = check.key === 'treasury' ? '/treasury' : group.link;
        continue;
      }
      groups.set(id, {
        key: check.key,
        accountId,
        labels: check.label ? [check.label] : [],
        side: check.side,
        subledgerMinor: check.subledgerMinor,
        foreignExcluded: check.foreignExcluded,
        lineColumn: check.lineColumn,
        includesJournalLines: check.includesJournalLines,
        link: check.link,
      });
    }

    const rows: LedgerIntegrityRowDto[] = [];
    for (const group of groups.values()) {
      // A mapping that isn't set and a sub-ledger that holds nothing: nothing to compare.
      if (!group.accountId && group.subledgerMinor === 0n) continue;
      rows.push(await this.row(db, group));
    }
    return { currency, generatedAt: new Date().toISOString(), rows };
  }

  private async row(db: Kysely<TenantDatabase>, group: Group): Promise<LedgerIntegrityRowDto> {
    const sign = (debitMinusCredit: bigint) => (group.side === 'debit' ? debitMinusCredit : -debitMinusCredit);
    const label = group.labels.length ? group.labels.join('، ') : null;
    if (!group.accountId) {
      return {
        key: group.key, label, accountId: null, accountCode: null, accountName: null,
        ledgerMinorUnits: '0', subledgerMinorUnits: group.subledgerMinor.toString(),
        differenceMinorUnits: (-group.subledgerMinor).toString(), foreignExcluded: group.foreignExcluded,
        unexplained: { count: 0, totalMinorUnits: '0', entries: [] }, link: group.link,
      };
    }
    const accountId = group.accountId;
    const account = await db.selectFrom('chart_of_accounts').select(['code', 'name']).where('id', '=', accountId).executeTakeFirst();

    const posted = db
      .selectFrom('journal_entry_lines as l')
      .innerJoin('journal_entries as e', 'e.id', 'l.journal_entry_id')
      .where('e.status', '=', 'posted')
      .where('l.account_id', '=', accountId);
    const sumOf = (rows: { debit: string | null; credit: string | null } | undefined) =>
      BigInt(rows?.debit ?? '0') - BigInt(rows?.credit ?? '0');
    const totals = await posted
      .select((eb) => [eb.fn.sum<string>('l.debit_amount').as('debit'), eb.fn.sum<string>('l.credit_amount').as('credit')])
      .executeTakeFirst();
    const ledger = sign(sumOf(totals));

    // Lines naming the party: already in the statement / treasury balance, or added here (HR).
    let subledger = group.subledgerMinor;
    const column = group.lineColumn;
    if (column && !group.includesJournalLines) {
      const named = await posted
        .where(`l.${column}`, 'is not', null)
        .select((eb) => [eb.fn.sum<string>('l.debit_amount').as('debit'), eb.fn.sum<string>('l.credit_amount').as('credit')])
        .executeTakeFirst();
      subledger += sign(sumOf(named));
    }

    // Manual lines that tie to nothing: the usual reason for a difference.
    let loose = posted.where('e.source', '=', 'manual');
    if (column) loose = loose.where(`l.${column}`, 'is', null);
    const looseRows = await loose
      .select(['e.id', 'e.entry_number', 'e.entry_date', 'l.debit_amount', 'l.credit_amount'])
      .orderBy('e.entry_date', 'desc')
      .execute();
    const looseTotal = looseRows.reduce((sum, r) => sum + sign(BigInt(r.debit_amount) - BigInt(r.credit_amount)), 0n);

    return {
      key: group.key,
      label,
      accountId,
      accountCode: account?.code ?? null,
      accountName: account?.name ?? null,
      ledgerMinorUnits: ledger.toString(),
      subledgerMinorUnits: subledger.toString(),
      differenceMinorUnits: (ledger - subledger).toString(),
      foreignExcluded: group.foreignExcluded,
      unexplained: {
        count: looseRows.length,
        totalMinorUnits: looseTotal.toString(),
        entries: looseRows.slice(0, MAX_LISTED).map((r) => ({
          id: r.id,
          number: r.entry_number,
          date: r.entry_date.slice(0, 10),
          amountMinorUnits: sign(BigInt(r.debit_amount) - BigInt(r.credit_amount)).toString(),
        })),
      },
      link: group.link,
    };
  }
}
