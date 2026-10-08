import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TreasuryKindDto, TreasuryStatementDto, TreasuryStatementQueryDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { TreasuryMovementRegistry, type TreasuryMovementKind } from '../../../shared/treasury/treasury-movements';
import { buildAccountStatement, openingBalanceEntry, type PartyLedgerEntry } from '../../../shared/statements/account-statement';
import { TreasuriesService } from './treasuries.service';

const money = (minor: bigint, currency: string) => ({ amountMinorUnits: minor.toString(), currency });

/**
 * حركة الخزينة: opening balance, every movement (from every module) with a
 * running balance, totals in / out — the same arithmetic as customer and
 * supplier statements (shared/statements/account-statement.ts).
 */
@Injectable()
export class TreasuryStatementService {
  constructor(
    private readonly treasuries: TreasuriesService,
    private readonly movements: TreasuryMovementRegistry,
  ) {}

  async getStatement(db: Kysely<TenantDatabase>, treasuryId: string, query: TreasuryStatementQueryDto): Promise<TreasuryStatementDto> {
    const treasury = await this.treasuries.findRow(db, treasuryId);
    const movements = (await this.movements.list(db, treasuryId)).filter((m) => m.currency === treasury.currency);

    const entries: PartyLedgerEntry<TreasuryMovementKind>[] = movements.map((m) => ({
      date: m.date,
      kind: m.kind,
      documentId: m.documentId,
      number: m.number,
      reference: m.counterparty,
      amountMinor: m.amountMinor,
      description: m.description,
      dueDate: null,
      sequence: m.sequence,
    }));
    const opening = openingBalanceEntry(BigInt(treasury.opening_balance_amount), treasury.opening_balance_date);
    if (opening) entries.push(opening);

    const statement = buildAccountStatement(entries, { from: query.from ?? null, to: query.to ?? null });
    const currency = treasury.currency;
    return {
      treasury: {
        id: treasury.id,
        code: treasury.code,
        name: treasury.name,
        kind: treasury.kind as TreasuryKindDto,
        currency,
        isDefault: treasury.is_default,
      },
      from: statement.from,
      to: statement.to,
      openingBalance: money(statement.openingBalanceMinor, currency),
      rows: statement.rows.map((row) => ({
        date: row.date,
        kind: row.kind,
        documentId: row.documentId,
        number: row.number,
        counterparty: row.reference,
        description: row.description ?? null,
        moneyIn: money(row.increaseMinor, currency),
        moneyOut: money(row.decreaseMinor, currency),
        balance: money(row.balanceMinor, currency),
      })),
      totalIn: money(statement.totalIncreaseMinor, currency),
      totalOut: money(statement.totalDecreaseMinor, currency),
      closingBalance: money(statement.closingBalanceMinor, currency),
    };
  }
}
