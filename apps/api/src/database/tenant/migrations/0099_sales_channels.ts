import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * Sales channels and marketplace settlements (Jumia / Noon / Amazon…).
 *
 * A marketplace that delivers and collects for the seller is a customer
 * with a running account: every order is an invoice on it (tagged with the
 * channel and the platform's order number), and once a week the platform
 * sends a statement — orders it paid, fees it kept (commission, shipping,
 * ads) and refunds of earlier orders — then wires the net.
 *
 * channel_settlements holds that statement. Posting it records a receipt
 * from the platform (orders − refunds) into the channel's treasury,
 * allocated to the matched invoices, and the fees as outflows of the same
 * treasury; what is left there is the payout, moved to the bank with an
 * ordinary transfer when it arrives.
 */
const migration: TenantMigration = {
  name: '0099_sales_channels',
  async up(db) {
    await sql`
      CREATE TABLE sales_channels (
        id UUID PRIMARY KEY,
        code TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'marketplace' CHECK (kind IN ('marketplace', 'direct')),
        customer_id UUID REFERENCES customers (id) ON DELETE RESTRICT,
        treasury_id UUID REFERENCES treasuries (id) ON DELETE RESTRICT,
        warehouse_id UUID REFERENCES warehouses (id) ON DELETE RESTRICT,
        is_active BOOLEAN NOT NULL DEFAULT true,
        notes TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT sales_channels_marketplace_parties CHECK (kind = 'direct' OR (customer_id IS NOT NULL AND treasury_id IS NOT NULL))
      )
    `.execute(db);
    await sql`
      ALTER TABLE sales_invoices
        ADD COLUMN sales_channel_id UUID REFERENCES sales_channels (id) ON DELETE RESTRICT,
        ADD COLUMN external_reference TEXT
    `.execute(db);
    await sql`CREATE INDEX sales_invoices_channel_ref_idx ON sales_invoices (sales_channel_id, external_reference)`.execute(db);

    await sql`
      CREATE TABLE channel_settlements (
        id UUID PRIMARY KEY,
        settlement_number TEXT NOT NULL UNIQUE,
        sales_channel_id UUID NOT NULL REFERENCES sales_channels (id) ON DELETE RESTRICT,
        status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'posted', 'cancelled')),
        statement_date DATE NOT NULL,
        period_from DATE,
        period_to DATE,
        statement_reference TEXT,
        currency TEXT NOT NULL,
        payment_received_id UUID REFERENCES payments_received (id) ON DELETE RESTRICT,
        notes TEXT,
        created_by_user_id UUID,
        posted_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
      )
    `.execute(db);
    await sql`
      CREATE TABLE channel_settlement_lines (
        id UUID PRIMARY KEY,
        channel_settlement_id UUID NOT NULL REFERENCES channel_settlements (id) ON DELETE CASCADE,
        line_number INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK (kind IN ('order', 'refund', 'fee')),
        external_reference TEXT,
        description TEXT,
        -- Always positive; the kind gives the direction (order +, refund −, fee −).
        amount BIGINT NOT NULL CHECK (amount > 0),
        sales_invoice_id UUID REFERENCES sales_invoices (id) ON DELETE RESTRICT,
        category_id UUID REFERENCES treasury_categories (id) ON DELETE RESTRICT
      )
    `.execute(db);
    await sql`CREATE INDEX channel_settlement_lines_settlement_idx ON channel_settlement_lines (channel_settlement_id)`.execute(db);
  },
};

export default migration;
