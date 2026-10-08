import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import {
  lotsDetails,
  readPrintLabels,
  readWarehouseName,
  statusLabel,
} from '../../../../shared/printing/print-helpers';
import { TenantSettingsService } from '../../../settings/application/services/tenant-settings.service';
import { GoodsReceiptsService } from '../../application/services/goods-receipts.service';
import { PURCHASE_ORDER_REPOSITORY, type PurchaseOrderRepository } from '../../application/ports/purchase-order.repository';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../../application/ports/supplier.repository';
import { supplierParty } from './purchases-print-shared';

/** إذن استلام بضاعة — quantities, lots and expiry dates only, no costs. */
@Injectable()
export class GoodsReceiptPrintProvider implements PrintProvider {
  readonly documentType = 'goods_receipt';
  readonly label = 'إذن استلام بضاعة';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['purchases.manage'];

  constructor(
    private readonly receipts: GoodsReceiptsService,
    @Inject(PURCHASE_ORDER_REPOSITORY) private readonly orders: PurchaseOrderRepository,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const receipt = await this.receipts.getById(db, id);
    const [order, warehouseName] = await Promise.all([
      this.orders.findById(db, receipt.purchaseOrderId),
      readWarehouseName(db, receipt.warehouseId),
    ]);
    const supplier = order ? await this.suppliers.findById(db, order.supplierId) : null;
    const labels = await readPrintLabels(
      db,
      receipt.lines.map((line) => line.productVariantId),
      receipt.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: receipt.id,
      title: 'إذن استلام بضاعة',
      number: receipt.receiptNumber,
      status: receipt.status,
      statusLabel: statusLabel(receipt.status),
      date: receipt.receivedDate ?? localIsoDate(receipt.createdAt),
      currency: receipt.lines[0]?.unitCost.currency ?? (await this.tenantSettings.get(db)).currencyCode,
      party: supplier ? supplierParty(supplier) : null,
      fields: [
        ...(order ? [{ label: 'أمر الشراء', value: order.poNumber }] : []),
        ...(warehouseName ? [{ label: 'المخزن', value: warehouseName }] : []),
      ],
      lines: receipt.lines.map((line) => {
        const label = labels.variant(line.productVariantId);
        return {
          description: label.name,
          sku: label.sku,
          details: lotsDetails(line.lots, line.notes),
          quantity: line.quantityReceived,
          unit: labels.unit(line.unitOfMeasureId, line.productVariantId),
        };
      }),
      totals: null,
      notes: receipt.notes,
    };
  }
}
