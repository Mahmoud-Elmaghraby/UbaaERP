import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * POS Cash Sessions (CLAUDE.md §10 — step 4, Sales — POS feature,
 * Stage 1. See claude/sales-pos-research.md for the full design this
 * implements.)
 *
 * A cash session/shift: a cashier declares an opening float
 * (opening_cash_amount), sells during the session, then closes it by
 * physically counting the drawer (counted_cash_amount). expected_cash_
 * amount and variance_amount are computed by PosSessionsService.close()
 * at close time — expected_cash_amount is the opening float plus 'cash'
 * payment_method payments_received rows tagged with this session's id
 * (pos_session_id, added to payments_received by the very next
 * migration, 0060 — nothing populates it until Stage 3's checkout
 * orchestration exists, so expected_cash_amount is honestly just the
 * opening float until then). Both expected_cash_amount and
 * variance_amount are STORED, not recomputed on every read, because
 * once a session is closed its numbers are a historical fact (same
 * "closed period is immutable" discipline as fiscal_years/
 * accounting_periods) — a later correction to a payment must never
 * retroactively change what the cashier actually counted that day.
 *
 * cashier_user_id: REFERENCES users(id) ON DELETE RESTRICT, same
 * treatment as purchase_requisitions.requested_by — a session is a
 * historical record of what a specific person did; the user row must
 * be dealt with explicitly before it can be deleted, never silently
 * orphaned.
 *
 * status: 'open' | 'closed'. A cashier may have at most one open
 * session at a time — enforced by a partial UNIQUE index on
 * (cashier_user_id) WHERE status = 'open', not a general uniqueness
 * constraint (a cashier can have many historical closed sessions).
 *
 * No custom_fields column — unlike business documents a tenant admin
 * customizes (bank_accounts, sales_orders, ...), a POS session is a
 * system-generated operational record with a fixed, already-complete
 * shape; there is nothing here for the dynamic form engine to extend.
 */
const migration: TenantMigration = {
  name: '0059_create_pos_sessions',
  async up(db) {
    await sql`
      CREATE TABLE pos_sessions (
        id UUID PRIMARY KEY,
        cashier_user_id UUID NOT NULL REFERENCES users (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'closed')),
        opening_cash_amount BIGINT NOT NULL,
        currency TEXT NOT NULL,
        expected_cash_amount BIGINT,
        counted_cash_amount BIGINT,
        variance_amount BIGINT,
        notes TEXT,
        opened_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        closed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT pos_sessions_opening_cash_non_negative CHECK (opening_cash_amount >= 0)
      )
    `.execute(db);

    await sql`
      CREATE UNIQUE INDEX pos_sessions_one_open_per_cashier
        ON pos_sessions (cashier_user_id)
        WHERE status = 'open'
    `.execute(db);

    await sql`CREATE INDEX pos_sessions_status_idx ON pos_sessions (status)`.execute(db);
  },
};

export default migration;
