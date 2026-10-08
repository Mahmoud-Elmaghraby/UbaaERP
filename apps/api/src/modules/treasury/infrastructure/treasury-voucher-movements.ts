import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../database/tenant/kysely-client';
import { TreasuryMovementRegistry, type TreasuryMovement, type TreasuryMovementSource } from '../../../shared/treasury/treasury-movements';

/** The Treasury module's own vouchers as movements: expense (out), income (in), transfer (out of one, into the other). */
@Injectable()
export class TreasuryVoucherMovements implements TreasuryMovementSource, OnModuleInit {
  constructor(private readonly registry: TreasuryMovementRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    let query = db
      .selectFrom('treasury_vouchers as v')
      .innerJoin('treasuries as t', 't.id', 'v.treasury_id')
      .leftJoin('treasuries as tt', 'tt.id', 'v.to_treasury_id')
      .leftJoin('treasury_categories as c', 'c.id', 'v.category_id')
      .select([
        'v.id', 'v.voucher_number', 'v.kind', 'v.voucher_date', 'v.treasury_id', 'v.to_treasury_id', 'v.amount', 'v.currency',
        'v.counterparty', 'v.description', 'v.created_at', 't.name as from_name', 'tt.name as to_name', 'c.name as category_name',
      ])
      .where('v.status', '=', 'posted');
    if (treasuryId) {
      query = query.where((eb) => eb.or([eb('v.treasury_id', '=', treasuryId), eb('v.to_treasury_id', '=', treasuryId)]));
    }
    const movements: TreasuryMovement[] = [];
    for (const v of await query.execute()) {
      const amount = BigInt(v.amount);
      const base = { date: v.voucher_date, currency: v.currency, documentId: v.id, number: v.voucher_number, sequence: v.created_at.toISOString() };
      if (v.kind === 'transfer') {
        if (!treasuryId || treasuryId === v.treasury_id) {
          movements.push({ ...base, treasuryId: v.treasury_id, amountMinor: -amount, kind: 'transfer_out', counterparty: v.to_name, description: v.description });
        }
        if (v.to_treasury_id && (!treasuryId || treasuryId === v.to_treasury_id)) {
          movements.push({ ...base, treasuryId: v.to_treasury_id, amountMinor: amount, kind: 'transfer_in', counterparty: v.from_name, description: v.description });
        }
      } else {
        movements.push({
          ...base,
          treasuryId: v.treasury_id,
          amountMinor: v.kind === 'expense' ? -amount : amount,
          kind: v.kind === 'expense' ? 'expense' : 'income',
          counterparty: v.counterparty ?? v.category_name,
          description: [v.category_name, v.description].filter(Boolean).join(' — ') || null,
        });
      }
    }
    return movements;
  }
}
