import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { localIsoDate } from '../../../../shared/time/local-date';
import {
  TreasuryMovementRegistry,
  type TreasuryMovement,
  type TreasuryMovementSource,
} from '../../../../shared/treasury/treasury-movements';

/** Purchases' money movements for the Treasury module: posted supplier payments (money out). */
@Injectable()
export class PurchasesTreasuryMovements implements TreasuryMovementSource, OnModuleInit {
  constructor(private readonly registry: TreasuryMovementRegistry) {}

  onModuleInit(): void {
    this.registry.register(this);
  }

  async listMovements(db: Kysely<TenantDatabase>, treasuryId: string | null): Promise<TreasuryMovement[]> {
    let payments = db
      .selectFrom('supplier_payments as p')
      .innerJoin('suppliers as s', 's.id', 'p.supplier_id')
      .select(['p.id', 'p.payment_number', 'p.payment_date', 'p.created_at', 'p.amount_amount', 'p.amount_currency', 'p.treasury_id', 'p.reference_number', 's.name'])
      .where('p.status', '=', 'posted')
      .where('p.treasury_id', 'is not', null);
    if (treasuryId) payments = payments.where('p.treasury_id', '=', treasuryId);
    const rows = await payments.execute();
    return rows.map((r) => ({
      treasuryId: r.treasury_id!,
      date: r.payment_date ?? localIsoDate(r.created_at),
      amountMinor: -BigInt(r.amount_amount),
      currency: r.amount_currency,
      kind: 'supplier_payment' as const,
      documentId: r.id,
      number: r.payment_number,
      counterparty: r.name,
      description: r.reference_number,
      sequence: r.created_at.toISOString(),
    }));
  }
}
