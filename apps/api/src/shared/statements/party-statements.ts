import { randomUUID } from 'node:crypto';
import type { Kysely } from 'kysely';
import type {
  AgingBucketsDto,
  OpeningBalanceDto,
  PartyBalancesQueryDto,
  PartyBalancesReportDto,
  PartyKindDto,
  PartyStatementDto,
  PartyStatementQueryDto,
  SetOpeningBalanceDto,
} from '@erp-platform/contracts';
import type { TenantDatabase } from '../../database/tenant/kysely-client';
import { withTransaction } from '../../database/tenant/transaction.util';
import type { OutboxWriterService } from '../outbox/application/services/outbox-writer.service';
import { entityNotFound } from '../errors/entity-errors';
import { localIsoDate } from '../time/local-date';
import { ageBalance, buildAccountStatement, type AgingBuckets, type PartyLedgerEntry } from './account-statement';

/**
 * The one implementation of customer AND supplier statements, balances and
 * opening balances. Sales and Purchases each provide a PartyLedgerSource —
 * how to read their own parties and turn their own documents into ledger
 * entries — and get identical statements, aging and opening-balance
 * handling (including the outbox event Accounting listens to).
 */
export interface PartyInfo {
  id: string;
  name: string;
  code: string;
  phone: string | null;
  defaultCurrency: string;
  isActive: boolean;
}

export interface PartyLedgerSourceEntry extends PartyLedgerEntry {
  partyId: string;
  currency: string;
}

export interface PartyLedgerSource {
  partyKind: PartyKindDto;
  table: 'customers' | 'suppliers';
  /** Outbox event written when an opening balance changes (Accounting posts it, if enabled). */
  openingBalanceEvent: string;
  findParty(db: Kysely<TenantDatabase>, id: string): Promise<PartyInfo | null>;
  listParties(db: Kysely<TenantDatabase>): Promise<PartyInfo[]>;
  /** Every ledger entry (opening balance included) of one party, or of all parties when `partyId` is null. */
  listEntries(db: Kysely<TenantDatabase>, partyId: string | null): Promise<PartyLedgerSourceEntry[]>;
}

const money = (minor: bigint, currency: string) => ({ amountMinorUnits: minor.toString(), currency });

async function tenantCurrency(db: Kysely<TenantDatabase>): Promise<string> {
  const row = await db.selectFrom('tenant_settings').select('currency_code').limit(1).executeTakeFirst();
  return row?.currency_code ?? 'EGP';
}

export async function getPartyStatement(
  db: Kysely<TenantDatabase>,
  source: PartyLedgerSource,
  partyId: string,
  query: PartyStatementQueryDto,
): Promise<PartyStatementDto> {
  const party = await source.findParty(db, partyId);
  if (!party) throw entityNotFound(source.partyKind === 'customer' ? 'CUSTOMER' : 'SUPPLIER', partyId);

  const entries = await source.listEntries(db, partyId);
  const currencies = [...new Set([party.defaultCurrency, ...entries.map((e) => e.currency)])].sort();
  const currency = query.currency ?? (entries.some((e) => e.currency === party.defaultCurrency) || entries.length === 0
    ? party.defaultCurrency
    : entries[0]!.currency);

  const statement = buildAccountStatement(
    entries.filter((e) => e.currency === currency),
    { from: query.from ?? null, to: query.to ?? null },
  );

  return {
    partyKind: source.partyKind,
    party: { id: party.id, name: party.name, code: party.code },
    currency,
    currencies,
    from: statement.from,
    to: statement.to,
    openingBalance: money(statement.openingBalanceMinor, currency),
    rows: statement.rows.map((row) => ({
      date: row.date,
      kind: row.kind,
      documentId: row.documentId,
      number: row.number,
      reference: row.reference,
      dueDate: row.dueDate,
      increase: money(row.increaseMinor, currency),
      decrease: money(row.decreaseMinor, currency),
      balance: money(row.balanceMinor, currency),
    })),
    totalIncrease: money(statement.totalIncreaseMinor, currency),
    totalDecrease: money(statement.totalDecreaseMinor, currency),
    closingBalance: money(statement.closingBalanceMinor, currency),
  };
}

function bucketsToDto(b: AgingBuckets, currency: string): AgingBucketsDto {
  return {
    current: money(b.currentMinor, currency),
    days1To30: money(b.days1To30Minor, currency),
    days31To60: money(b.days31To60Minor, currency),
    days61To90: money(b.days61To90Minor, currency),
    over90: money(b.over90Minor, currency),
    total: money(b.totalMinor, currency),
    unappliedCredit: money(b.unappliedCreditMinor, currency),
  };
}

/** Receivables / payables report: every party's balance and aging, in one currency. */
export async function getPartyBalances(
  db: Kysely<TenantDatabase>,
  source: PartyLedgerSource,
  query: PartyBalancesQueryDto,
): Promise<PartyBalancesReportDto> {
  const asOf = query.asOf ?? localIsoDate();
  const currency = query.currency ?? (await tenantCurrency(db));
  const nonZeroOnly = query.nonZeroOnly !== 'false';
  const [parties, entries] = await Promise.all([source.listParties(db), source.listEntries(db, null)]);

  const byParty = new Map<string, PartyLedgerSourceEntry[]>();
  for (const entry of entries) {
    if (entry.currency !== currency) continue;
    const list = byParty.get(entry.partyId) ?? [];
    list.push(entry);
    byParty.set(entry.partyId, list);
  }

  const total: AgingBuckets & { balanceMinor: bigint } = {
    currentMinor: 0n, days1To30Minor: 0n, days31To60Minor: 0n, days61To90Minor: 0n,
    over90Minor: 0n, totalMinor: 0n, unappliedCreditMinor: 0n, balanceMinor: 0n,
  };
  const rows: PartyBalancesReportDto['rows'] = [];
  for (const party of parties) {
    const partyEntries = (byParty.get(party.id) ?? []).filter((e) => e.date <= asOf);
    const balance = partyEntries.reduce((sum, e) => sum + e.amountMinor, 0n);
    if (nonZeroOnly && balance === 0n) continue;
    if (!nonZeroOnly && partyEntries.length === 0 && !party.isActive) continue;
    const aging = ageBalance(partyEntries, asOf);
    total.currentMinor += aging.currentMinor;
    total.days1To30Minor += aging.days1To30Minor;
    total.days31To60Minor += aging.days31To60Minor;
    total.days61To90Minor += aging.days61To90Minor;
    total.over90Minor += aging.over90Minor;
    total.totalMinor += aging.totalMinor;
    total.unappliedCreditMinor += aging.unappliedCreditMinor;
    total.balanceMinor += balance;
    const lastActivity = partyEntries.reduce<string | null>(
      (latest, e) => (e.kind !== 'opening_balance' && (!latest || e.date > latest) ? e.date : latest),
      null,
    );
    rows.push({
      partyId: party.id,
      name: party.name,
      code: party.code,
      phone: party.phone,
      currency,
      balance: money(balance, currency),
      aging: bucketsToDto(aging, currency),
      lastActivityDate: lastActivity,
    });
  }
  rows.sort((a, b) => (BigInt(b.balance.amountMinorUnits) > BigInt(a.balance.amountMinorUnits) ? 1 : -1));

  return {
    partyKind: source.partyKind,
    asOf,
    currency,
    rows,
    totals: { ...bucketsToDto(total, currency), balance: money(total.balanceMinor, currency) },
  };
}

export async function getOpeningBalance(
  db: Kysely<TenantDatabase>,
  source: PartyLedgerSource,
  partyId: string,
): Promise<OpeningBalanceDto> {
  const row = await db
    .selectFrom(source.table)
    .select(['opening_balance_amount', 'opening_balance_currency', 'opening_balance_date', 'default_currency'])
    .where('id', '=', partyId)
    .executeTakeFirst();
  if (!row) throw entityNotFound(source.partyKind === 'customer' ? 'CUSTOMER' : 'SUPPLIER', partyId);
  const signed = BigInt(row.opening_balance_amount);
  if (signed === 0n) return { amount: null, side: null, date: row.opening_balance_date };
  return {
    amount: money(signed < 0n ? -signed : signed, row.opening_balance_currency ?? row.default_currency),
    side: signed > 0n ? (source.partyKind === 'customer' ? 'owes_us' : 'we_owe') : source.partyKind === 'customer' ? 'we_owe' : 'owes_us',
    date: row.opening_balance_date,
  };
}

/**
 * Sets (replaces) a party's opening balance and, in the same transaction,
 * writes the outbox event Accounting uses to post the difference against
 * the opening-balance equity account (CLAUDE.md §2.7). Accounting disabled
 * → the event is simply skipped there.
 */
export async function setOpeningBalance(
  db: Kysely<TenantDatabase>,
  source: PartyLedgerSource,
  outbox: OutboxWriterService,
  context: { schema: string; actorUserId: string | null },
  partyId: string,
  input: SetOpeningBalanceDto,
): Promise<OpeningBalanceDto> {
  const amount = BigInt(input.amount.amountMinorUnits);
  // Stored in the party's own sense: + = customer owes us / we owe the supplier.
  const increasesBalance = source.partyKind === 'customer' ? input.side === 'owes_us' : input.side === 'we_owe';
  const signed = increasesBalance ? amount : -amount;

  await withTransaction(db, async (trx) => {
    const previous = await trx
      .selectFrom(source.table)
      .select(['opening_balance_amount', 'opening_balance_currency', 'default_currency', 'name'])
      .where('id', '=', partyId)
      .forUpdate()
      .executeTakeFirst();
    if (!previous) throw entityNotFound(source.partyKind === 'customer' ? 'CUSTOMER' : 'SUPPLIER', partyId);

    await trx
      .updateTable(source.table)
      .set({
        opening_balance_amount: signed.toString(),
        opening_balance_currency: signed === 0n ? null : input.amount.currency,
        opening_balance_date: signed === 0n ? null : input.date,
        updated_at: new Date(),
      })
      .where('id', '=', partyId)
      .execute();

    const previousSigned = BigInt(previous.opening_balance_amount);
    const previousCurrency = previous.opening_balance_currency ?? previous.default_currency;
    if (previousSigned === signed && (signed === 0n || previousCurrency === input.amount.currency)) return;

    await outbox.write(trx, source.openingBalanceEvent, {
      schema: context.schema,
      entityType: source.partyKind,
      entityId: partyId,
      action: 'opening_balance_set',
      occurredAt: new Date(),
      actorUserId: context.actorUserId,
      metadata: {
        // Unique per change: Accounting's idempotency key for the journal entry of this change.
        changeId: randomUUID(),
        partyName: previous.name,
        date: input.date,
        previous: { amountMinorUnits: previousSigned.toString(), currency: previousCurrency },
        next: { amountMinorUnits: signed.toString(), currency: input.amount.currency },
      },
    });
  });

  return getOpeningBalance(db, source, partyId);
}
