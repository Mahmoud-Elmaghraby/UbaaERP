import { randomUUID } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { SalesChannelDto, SaveSalesChannelDto } from '@erp-platform/contracts';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { BusinessRuleError, isPostgresUniqueViolation } from '../../../../shared/errors/domain-errors';
import { duplicateEntity, entityNotFound } from '../../../../shared/errors/entity-errors';

/**
 * Sales channels — where an order came from: the shop / direct sales, or a
 * marketplace (Jumia, Noon, Amazon…). A marketplace has the customer that
 * stands for the platform and the treasury its money sits in until it
 * reaches the bank (see ChannelSettlementsService).
 */
@Injectable()
export class SalesChannelsService {
  async list(db: Kysely<TenantDatabase>): Promise<SalesChannelDto[]> {
    const rows = await this.base(db).orderBy('ch.is_active', 'desc').orderBy('ch.name').execute();
    return rows.map(toDto);
  }

  async getById(db: Kysely<TenantDatabase>, id: string): Promise<SalesChannelDto> {
    const row = await this.base(db).where('ch.id', '=', id).executeTakeFirst();
    if (!row) throw entityNotFound('SALES_CHANNEL', id);
    return toDto(row);
  }

  async save(db: Kysely<TenantDatabase>, id: string | null, input: SaveSalesChannelDto): Promise<SalesChannelDto> {
    if (input.kind === 'marketplace' && (!input.customerId || !input.treasuryId)) {
      throw new BusinessRuleError('A marketplace channel needs its customer and its treasury.', {
        code: 'SALES_CHANNEL.MARKETPLACE_INCOMPLETE',
      });
    }
    const values = {
      code: input.code,
      name: input.name,
      kind: input.kind,
      customer_id: input.customerId ?? null,
      treasury_id: input.treasuryId ?? null,
      warehouse_id: input.warehouseId ?? null,
      is_active: input.isActive ?? true,
      notes: input.notes ?? null,
    };
    const channelId = id ?? randomUUID();
    try {
      if (id) {
        const updated = await db.updateTable('sales_channels').set({ ...values, updated_at: new Date() }).where('id', '=', id).executeTakeFirst();
        if (!updated.numUpdatedRows) throw entityNotFound('SALES_CHANNEL', id);
      } else {
        await db.insertInto('sales_channels').values({ id: channelId, ...values }).execute();
      }
    } catch (err) {
      if (isPostgresUniqueViolation(err)) throw duplicateEntity('SALES_CHANNEL', 'code', input.code);
      throw err;
    }
    return this.getById(db, channelId);
  }

  private base(db: Kysely<TenantDatabase>) {
    return db
      .selectFrom('sales_channels as ch')
      .leftJoin('customers as c', 'c.id', 'ch.customer_id')
      .leftJoin('treasuries as t', 't.id', 'ch.treasury_id')
      .selectAll('ch')
      .select(['c.name as customer_name', 't.name as treasury_name']);
  }
}

function toDto(row: {
  id: string;
  code: string;
  name: string;
  kind: string;
  customer_id: string | null;
  customer_name: string | null;
  treasury_id: string | null;
  treasury_name: string | null;
  warehouse_id: string | null;
  is_active: boolean;
  notes: string | null;
}): SalesChannelDto {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    kind: row.kind as SalesChannelDto['kind'],
    customerId: row.customer_id,
    customerName: row.customer_name,
    treasuryId: row.treasury_id,
    treasuryName: row.treasury_name,
    warehouseId: row.warehouse_id,
    isActive: row.is_active,
    notes: row.notes,
  };
}
