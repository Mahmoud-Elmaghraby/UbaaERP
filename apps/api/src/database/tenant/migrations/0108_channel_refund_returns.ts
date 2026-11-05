import { sql } from 'kysely';
import type { TenantMigration } from '../migration.types';

/**
 * A marketplace refund in a settlement (the platform takes the money back,
 * the goods come back to the warehouse later) opens a draft sales return for
 * that order. The return remembers the settlement it came from; confirming it
 * when the goods arrive puts them back in stock and issues the credit note.
 */
const migration: TenantMigration = {
  name: '0108_channel_refund_returns',
  async up(db) {
    await sql`
      ALTER TABLE sales_returns
        ADD COLUMN channel_settlement_id UUID REFERENCES channel_settlements (id) ON DELETE SET NULL
    `.execute(db);
    await sql`CREATE INDEX sales_returns_channel_settlement_idx ON sales_returns (channel_settlement_id) WHERE channel_settlement_id IS NOT NULL`.execute(db);
  },
};

export default migration;
