import { sql, type Kysely, type Selectable } from 'kysely';
import type { InventorySettingsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { InventorySettingsRepository } from '../../application/ports/inventory-settings.repository';
import type {
  BarcodeMode,
  InventorySettings,
  ItemCodeMode,
  UpdateInventorySettingsInput,
} from '../../domain/inventory-settings.entity';

function toDomain(row: Selectable<InventorySettingsTable>): InventorySettings {
  return {
    itemCodeMode: row.item_code_mode as ItemCodeMode,
    barcodeMode: row.barcode_mode as BarcodeMode,
    barcodePrefix: row.barcode_prefix,
    updatedAt: row.updated_at,
  };
}

export class KyselyInventorySettingsRepository implements InventorySettingsRepository {
  async get(db: Kysely<TenantDatabase>): Promise<InventorySettings> {
    const row = await db.selectFrom('inventory_settings').selectAll().executeTakeFirstOrThrow();
    return toDomain(row);
  }

  async update(db: Kysely<TenantDatabase>, input: UpdateInventorySettingsInput): Promise<InventorySettings> {
    const row = await db
      .updateTable('inventory_settings')
      .set({
        ...(input.itemCodeMode !== undefined ? { item_code_mode: input.itemCodeMode } : {}),
        ...(input.barcodeMode !== undefined ? { barcode_mode: input.barcodeMode } : {}),
        ...(input.barcodePrefix !== undefined ? { barcode_prefix: input.barcodePrefix } : {}),
        updated_at: sql`now()`,
      })
      .where('singleton', '=', true)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
