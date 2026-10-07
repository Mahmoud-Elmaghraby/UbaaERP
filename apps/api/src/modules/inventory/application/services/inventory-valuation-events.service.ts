import { Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { Money } from '@erp-platform/shared-kernel';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import { OutboxWriterService } from '../../../../shared/outbox/application/services/outbox-writer.service';
import {
  INVENTORY_VALUATION_POSTED,
  type InventoryValuationEntry,
  type InventoryValuationKind,
  type InventoryValuationPostedMetadata,
  type InventoryValuationSource,
} from '../../../../shared/events/inventory-valuation-event';

export interface ValuationEntryInput {
  kind: InventoryValuationKind;
  amount: Money;
  counterAccountId?: string | null;
}

import { localIsoDate } from '../../../../shared/time/local-date';

export { localIsoDate };

/**
 * The single writer of 'inventory.valuation.posted' (see the event file for
 * what Accounting does with it). Every inventory operation that changes
 * stock value outside a sale calls this inside its own transaction, so the
 * journal entry can never be lost or posted for a rolled-back operation.
 * Entries of the same kind and counter-account are merged; zero entries are
 * dropped; nothing is written when nothing is left.
 */
@Injectable()
export class InventoryValuationEventsService {
  constructor(private readonly outbox: OutboxWriterService) {}

  async write(
    trx: Kysely<TenantDatabase>,
    input: {
      schema: string;
      actorUserId: string | null;
      sourceType: InventoryValuationSource;
      sourceId: string;
      documentNumber?: string | null;
      entryDate?: string | null;
      description?: string | null;
      entries: ValuationEntryInput[];
    },
  ): Promise<boolean> {
    const merged = new Map<string, { kind: InventoryValuationKind; amount: Money; counterAccountId: string | null }>();
    for (const entry of input.entries) {
      if (entry.amount.isZero()) continue;
      const counterAccountId = entry.counterAccountId ?? null;
      const key = `${entry.kind}|${counterAccountId ?? ''}|${entry.amount.currency}`;
      const existing = merged.get(key);
      merged.set(key, {
        kind: entry.kind,
        counterAccountId,
        amount: existing ? existing.amount.add(entry.amount) : entry.amount,
      });
    }
    const entries: InventoryValuationEntry[] = [...merged.values()]
      .filter((entry) => !entry.amount.isZero())
      .map((entry) => ({
        kind: entry.kind,
        counterAccountId: entry.counterAccountId,
        amount: { amountMinorUnits: entry.amount.toMinorUnits().toString(), currency: entry.amount.currency },
      }));
    if (entries.length === 0) return false;

    const metadata: InventoryValuationPostedMetadata = {
      sourceType: input.sourceType,
      sourceId: input.sourceId,
      documentNumber: input.documentNumber ?? null,
      entryDate: input.entryDate ?? localIsoDate(),
      description: input.description ?? null,
      entries,
    };
    await this.outbox.write(trx, INVENTORY_VALUATION_POSTED, {
      schema: input.schema,
      entityType: input.sourceType,
      entityId: input.sourceId,
      action: 'valuation_posted',
      actorUserId: input.actorUserId,
      metadata: metadata as unknown as Record<string, unknown>,
      occurredAt: new Date(),
    });
    return true;
  }
}
