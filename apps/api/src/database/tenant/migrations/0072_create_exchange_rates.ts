import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * exchange_rates (claude/multi-currency-strategy.md, Phase 1 — confirmed
 * design decisions 2026-09-12). Infrastructure-only table: nothing reads
 * from it automatically yet (AccountingAutoPostingListeners still ignores
 * a source document's currency until Phase 3 wires
 * CurrencyConversionService in) — see that doc's §6 phase plan.
 *
 * Deliberately an append-only quote ledger, not a "current rate" row per
 * currency pair: a new rate is always a new row with its own rate_date,
 * never an UPDATE of a past one — same "don't overwrite history" practice
 * the strategy doc's Odoo research (§3.4) called out, and what lets a
 * journal entry created weeks ago still be explained by the exact rate
 * that was in effect at the time. No update()/delete() in the repository
 * for the same reason — a data-entry mistake is corrected by inserting a
 * new, more recent row, not by mutating the old one.
 *
 * source distinguishes a rate a tenant admin typed in by hand from one
 * fetched from the live FX API Phase 2 adds (frankfurter.app, per the
 * strategy doc's confirmed decision) — both land in the same table so
 * CurrencyConversionService's lookup doesn't need to care which produced
 * a given row, it only needs to prefer 'manual' over 'api' when both
 * exist for the same (from_currency, to_currency, rate_date): a tenant
 * who typed in a correction should always win over whatever the API said
 * for that day.
 *
 * to_currency is stored explicitly (not implicitly "always
 * tenant_settings.currency_code") so the table shape doesn't have to
 * change if a future stage ever needs a rate between two non-tenant
 * currencies — nothing today writes such a row, but nothing here forbids
 * it either.
 */
const migration: TenantMigration = {
  name: '0072_create_exchange_rates',
  async up(db) {
    await sql`
      CREATE TABLE exchange_rates (
        id UUID PRIMARY KEY,
        from_currency TEXT NOT NULL,
        to_currency TEXT NOT NULL,
        rate NUMERIC(18, 6) NOT NULL,
        rate_date DATE NOT NULL,
        source TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT exchange_rates_rate_positive CHECK (rate > 0),
        CONSTRAINT exchange_rates_source_whitelist CHECK (source IN ('manual', 'api')),
        CONSTRAINT exchange_rates_currencies_differ CHECK (from_currency <> to_currency),
        CONSTRAINT exchange_rates_unique_quote UNIQUE (from_currency, to_currency, rate_date, source)
      )
    `.execute(db);

    // CurrencyConversionService's lookup is always "most recent rate_date
    // <= asOfDate for this pair, preferring source='manual' on a tie" —
    // this index covers exactly that access pattern.
    await sql`
      CREATE INDEX exchange_rates_lookup_idx
        ON exchange_rates (from_currency, to_currency, rate_date DESC)
    `.execute(db);
  },
};

export default migration;
