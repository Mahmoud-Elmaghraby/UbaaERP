import { Injectable, type OnModuleInit } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { PrintRegistry } from '../../../../shared/printing/print-registry';
import { readPrintLabels, statusLabel } from '../../../../shared/printing/print-helpers';
import { INVENTORY_PERMISSIONS as P } from '../../../../shared/auth/inventory-permissions';
import { entityNotFound } from '../../../../shared/errors/entity-errors';

async function warehouseLabel(db: Kysely<TenantDatabase>, warehouseId: string, locationId: string | null): Promise<string> {
  const row = await db
    .selectFrom('warehouses as w')
    .leftJoin('warehouse_locations as l', (join) => join.on('l.id', '=', locationId ?? '00000000-0000-0000-0000-000000000000'))
    .select(['w.name as warehouse', 'l.name as location'])
    .where('w.id', '=', warehouseId)
    .executeTakeFirst();
  return row ? [row.warehouse, row.location].filter(Boolean).join(' — ') : '';
}

/** إذن تحويل مخزني — quantities only (what leaves one warehouse for another). */
class StockTransferPrintProvider implements PrintProvider {
  readonly documentType = 'stock_transfer';
  readonly label = 'إذن تحويل مخزني';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = [P.transfersManage, P.transfersApprove];

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const doc = await db.selectFrom('stock_transfers').selectAll().where('id', '=', id).executeTakeFirst();
    if (!doc) throw entityNotFound('STOCK_TRANSFER', id);
    const lines = await db.selectFrom('stock_transfer_lines').selectAll().where('stock_transfer_id', '=', id).orderBy('line_number').execute();
    const labels = await readPrintLabels(db, lines.map((l) => l.product_variant_id), lines.map((l) => l.unit_of_measure_id));
    const [from, to] = await Promise.all([
      warehouseLabel(db, doc.from_warehouse_id, doc.from_location_id),
      warehouseLabel(db, doc.to_warehouse_id, doc.to_location_id),
    ]);
    return {
      id: doc.id,
      title: 'إذن تحويل مخزني',
      number: doc.transfer_number,
      status: doc.status,
      statusLabel: statusLabel(doc.status),
      date: doc.transfer_date,
      currency: '',
      party: null,
      fields: [
        { label: 'من', value: from },
        { label: 'إلى', value: to },
      ],
      lines: lines.map((line) => {
        const label = labels.variant(line.product_variant_id);
        return {
          description: label.name,
          sku: label.sku,
          quantity: Number(line.quantity),
          unit: labels.unit(line.unit_of_measure_id, line.product_variant_id),
          details: line.received_quantity !== null ? `المستلم: ${Number(line.received_quantity)}` : null,
        };
      }),
      totals: null,
      notes: doc.notes,
    };
  }
}

/** إذن تسوية مخزنية — additions and deductions with their reasons (no costs). */
class StockAdjustmentPrintProvider implements PrintProvider {
  readonly documentType = 'stock_adjustment';
  readonly label = 'إذن تسوية مخزنية';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = [P.movementsManage, P.settingsManage, P.stockView];

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const doc = await db.selectFrom('stock_adjustments').selectAll().where('id', '=', id).executeTakeFirst();
    if (!doc) throw entityNotFound('STOCK_ADJUSTMENT', id);
    const lines = await db.selectFrom('stock_adjustment_lines').selectAll().where('stock_adjustment_id', '=', id).orderBy('line_number').execute();
    const reasonIds = [...new Set([doc.reason_id, ...lines.map((l) => l.reason_id)].filter((r): r is string => Boolean(r)))];
    const reasons = reasonIds.length
      ? new Map((await db.selectFrom('stock_adjustment_reasons').select(['id', 'name']).where('id', 'in', reasonIds).execute()).map((r) => [r.id, r.name]))
      : new Map<string, string>();
    const labels = await readPrintLabels(db, lines.map((l) => l.product_variant_id), lines.map((l) => l.unit_of_measure_id));
    return {
      id: doc.id,
      title: 'إذن تسوية مخزنية',
      number: doc.adjustment_number,
      status: doc.status,
      statusLabel: statusLabel(doc.status),
      date: doc.adjustment_date,
      currency: '',
      party: null,
      fields: [
        { label: 'المخزن', value: await warehouseLabel(db, doc.warehouse_id, doc.location_id) },
        ...(doc.reason_id && reasons.get(doc.reason_id) ? [{ label: 'السبب', value: reasons.get(doc.reason_id)! }] : []),
      ],
      lines: lines.map((line) => {
        const label = labels.variant(line.product_variant_id);
        const out = line.direction === 'decrease';
        return {
          description: label.name,
          sku: label.sku,
          quantity: Number(line.quantity),
          unit: labels.unit(line.unit_of_measure_id, line.product_variant_id),
          details: [out ? '− خصم' : '+ إضافة', line.reason_id ? reasons.get(line.reason_id) : null, line.lot_number]
            .filter(Boolean)
            .join(' — '),
        };
      }),
      totals: null,
      notes: doc.notes,
    };
  }
}

/** Registers Inventory's printable documents with the central print service. */
@Injectable()
export class InventoryPrintRegistration implements OnModuleInit {
  constructor(private readonly registry: PrintRegistry) {}

  onModuleInit(): void {
    this.registry.register(new StockTransferPrintProvider(), new StockAdjustmentPrintProvider());
  }
}
