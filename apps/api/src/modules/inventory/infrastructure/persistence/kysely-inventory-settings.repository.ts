import { sql, type Kysely, type Selectable } from 'kysely';
import type { InventorySettingsTable, TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { InventorySettingsRepository } from '../../application/ports/inventory-settings.repository';
import type {
  BarcodeMode,
  InventorySettings,
  ItemCodeMode,
  ScaleValueType,
  UpdateInventorySettingsInput,
} from '../../domain/inventory-settings.entity';

function toDomain(row: Selectable<InventorySettingsTable>): InventorySettings {
  return {
    itemCodeMode: row.item_code_mode as ItemCodeMode,
    barcodeMode: row.barcode_mode as BarcodeMode,
    barcodePrefix: row.barcode_prefix,
    scaleBarcodeEnabled: row.scale_barcode_enabled,
    scaleBarcodePrefix: row.scale_barcode_prefix,
    scaleItemCodeLength: row.scale_item_code_length,
    scaleValueType: row.scale_value_type as ScaleValueType,
    scaleValueDecimals: row.scale_value_decimals,
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
        ...(input.scaleBarcodeEnabled !== undefined ? { scale_barcode_enabled: input.scaleBarcodeEnabled } : {}),
        ...(input.scaleBarcodePrefix !== undefined ? { scale_barcode_prefix: input.scaleBarcodePrefix } : {}),
        ...(input.scaleItemCodeLength !== undefined ? { scale_item_code_length: input.scaleItemCodeLength } : {}),
        ...(input.scaleValueType !== undefined ? { scale_value_type: input.scaleValueType } : {}),
        ...(input.scaleValueDecimals !== undefined ? { scale_value_decimals: input.scaleValueDecimals } : {}),
        updated_at: sql`now()`,
      })
      .where('singleton', '=', true)
      .returningAll()
      .executeTakeFirstOrThrow();
    return toDomain(row);
  }
}
