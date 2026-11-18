import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { companyCurrency, LedgerCheckRegistry, type LedgerCheckRow, type LedgerCheckSource } from '../../../shared/integrity/ledger-checks';

/**
 * Open employee loans (paid out − repaid, by payroll deduction or in cash) against the advances
 * account, and posted payroll not yet paid against salaries payable.
 */
@Injectable()
export class HrLedgerChecks implements LedgerCheckSource, OnModuleInit {
  constructor(private readonly registry: LedgerCheckRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listChecks(db: Kysely<TenantDatabase>): Promise<LedgerCheckRow[]> {
    const currency = await companyCurrency(db);
    const loans = await db
      .selectFrom('hr_loans as l')
      .leftJoin('hr_loan_installments as i', 'i.loan_id', 'l.id')
      .select(['l.id', 'l.amount_minor', 'l.currency', (eb) => eb.fn.coalesce(eb.fn.sum<string>('i.paid_minor'), eb.val('0')).as('paid')])
      .where('l.status', 'in', ['active', 'closed'])
      .groupBy(['l.id', 'l.amount_minor', 'l.currency'])
      .execute();
    const open = loans
      .filter((l) => l.currency === currency)
      .reduce((sum, l) => sum + BigInt(l.amount_minor) - BigInt(l.paid), 0n);

    const runs = await db
      .selectFrom('hr_payroll_runs as r')
      .innerJoin('hr_payroll_lines as pl', 'pl.run_id', 'r.id')
      .select(['r.currency', (eb) => eb.fn.sum<string>('pl.net_minor').as('net')])
      .where('r.status', 'in', ['posted', 'paid'])
      .groupBy('r.currency')
      .execute();
    const payments = await db
      .selectFrom('hr_payroll_payments')
      .select(['currency', (eb) => eb.fn.sum<string>('amount_minor').as('paid')])
      .groupBy('currency')
      .execute();
    const net = BigInt(runs.find((r) => r.currency === currency)?.net ?? '0');
    const paid = BigInt(payments.find((p) => p.currency === currency)?.paid ?? '0');

    return [
      {
        key: 'employee_advances',
        account: { setting: 'employeeAdvancesAccountId' },
        side: 'debit',
        subledgerMinor: open,
        foreignExcluded: loans.length - loans.filter((l) => l.currency === currency).length,
        includesJournalLines: false,
        lineColumn: 'employee_id',
        link: '/hr/loans',
      },
      {
        key: 'salaries_payable',
        account: { setting: 'salariesPayableAccountId' },
        side: 'credit',
        subledgerMinor: net - paid,
        foreignExcluded: runs.filter((r) => r.currency !== currency).length,
        includesJournalLines: false,
        lineColumn: 'employee_id',
        link: '/hr/payroll',
      },
    ];
  }
}
