import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { amountTotalsDto, moneyDto, readPrintLabels, statusLabel } from '../../../../shared/printing/print-helpers';
import { PurchaseOrdersService } from '../../application/services/purchase-orders.service';
import { SUPPLIER_REPOSITORY, type SupplierRepository } from '../../application/ports/supplier.repository';
import { supplierParty } from './purchases-print-shared';

/** أمر شراء — prices without taxes (taxes are fixed on the purchase invoice). */
@Injectable()
export class PurchaseOrderPrintProvider implements PrintProvider {
  readonly documentType = 'purchase_order';
  readonly label = 'أمر شراء';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['purchases.manage'];

  constructor(
    private readonly orders: PurchaseOrdersService,
    @Inject(SUPPLIER_REPOSITORY) private readonly suppliers: SupplierRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const order = await this.orders.getById(db, id);
    const supplier = await this.suppliers.findById(db, order.supplierId);
    const labels = await readPrintLabels(
      db,
      order.lines.map((line) => line.productVariantId),
      order.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: order.id,
      title: 'أمر شراء',
      number: order.poNumber,
      status: order.status,
      statusLabel: statusLabel(order.status),
      date: localIsoDate(order.createdAt),
      currency: order.totalAmount.currency,
      party: supplier ? supplierParty(supplier) : null,
      fields: order.expectedDeliveryDate ? [{ label: 'تاريخ التوريد المتوقع', value: order.expectedDeliveryDate }] : [],
      lines: order.lines.map((line) => {
        const label = labels.variant(line.productVariantId);
        return {
          description: label.name,
          sku: label.sku,
          details: line.notes,
          quantity: line.quantity,
          unit: labels.unit(line.unitOfMeasureId, line.productVariantId),
          unitPrice: moneyDto(line.unitPrice),
          amount: moneyDto(line.unitPrice.multiplyByQuantity(line.quantity)),
        };
      }),
      totals: amountTotalsDto(order.totalAmount),
      notes: order.notes,
    };
  }
}
