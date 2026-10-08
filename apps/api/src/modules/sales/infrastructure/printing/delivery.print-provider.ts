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
import { DeliveriesService } from '../../application/services/deliveries.service';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../../application/ports/sales-order.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import { customerParty } from './sales-print-shared';

/** إذن تسليم — quantities and lots only, no prices. */
@Injectable()
export class DeliveryPrintProvider implements PrintProvider {
  readonly documentType = 'delivery';
  readonly label = 'إذن تسليم';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(
    private readonly deliveries: DeliveriesService,
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
    private readonly tenantSettings: TenantSettingsService,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const delivery = await this.deliveries.getById(db, id);
    const [order, warehouseName] = await Promise.all([
      this.orders.findById(db, delivery.salesOrderId),
      readWarehouseName(db, delivery.warehouseId),
    ]);
    const customer = order ? await this.customers.findById(db, order.customerId) : null;
    const labels = await readPrintLabels(
      db,
      delivery.lines.map((line) => line.productVariantId),
      delivery.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: delivery.id,
      title: 'إذن تسليم',
      number: delivery.deliveryNumber,
      status: delivery.status,
      statusLabel: statusLabel(delivery.status),
      date: delivery.deliveryDate ?? localIsoDate(delivery.createdAt),
      currency: order?.currency ?? (await this.tenantSettings.get(db)).currencyCode,
      party: customer ? customerParty(customer) : null,
      fields: [
        ...(order ? [{ label: 'أمر البيع', value: order.soNumber }] : []),
        ...(warehouseName ? [{ label: 'المخزن', value: warehouseName }] : []),
      ],
      lines: delivery.lines.map((line) => {
        const label = labels.variant(line.productVariantId);
        return {
          description: label.name,
          sku: label.sku,
          details: lotsDetails(line.lots, line.notes),
          quantity: line.quantityDelivered,
          unit: labels.unit(line.unitOfMeasureId, line.productVariantId),
        };
      }),
      totals: null,
      notes: delivery.notes,
    };
  }
}
