import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { amountTotalsDto, moneyDto, readPrintLabels, statusLabel } from '../../../../shared/printing/print-helpers';
import { SalesOrdersService } from '../../application/services/sales-orders.service';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import { calculateLineNetAmount } from '../../domain/sales-order.entity';
import { customerParty } from './sales-print-shared';

/**
 * أمر بيع — each line at its net after its own discount; the header
 * discount prints as the gap between subtotal and total.
 */
@Injectable()
export class SalesOrderPrintProvider implements PrintProvider {
  readonly documentType = 'sales_order';
  readonly label = 'أمر بيع';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(
    private readonly orders: SalesOrdersService,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const order = await this.orders.getById(db, id);
    const customer = await this.customers.findById(db, order.customerId);
    const labels = await readPrintLabels(
      db,
      order.lines.map((line) => line.productVariantId),
      order.lines.map((line) => line.unitOfMeasureId),
    );
    const headerDiscount = order.subtotalAmount.subtract(order.totalAmount);
    return {
      id: order.id,
      title: 'أمر بيع',
      number: order.soNumber,
      status: order.status,
      statusLabel: statusLabel(order.status),
      date: localIsoDate(order.createdAt),
      currency: order.totalAmount.currency,
      party: customer ? customerParty(customer) : null,
      fields: [],
      lines: order.lines.map((line) => {
        const label = labels.variant(line.productVariantId);
        return {
          description: label.name,
          sku: label.sku,
          details: line.notes,
          quantity: line.quantity,
          unit: labels.unit(line.unitOfMeasureId, line.productVariantId),
          unitPrice: moneyDto(line.unitPrice),
          amount: moneyDto(calculateLineNetAmount(line)),
        };
      }),
      totals: {
        ...amountTotalsDto(order.totalAmount),
        netAmount: moneyDto(order.subtotalAmount),
        discountAmount: headerDiscount.isPositive() ? moneyDto(headerDiscount) : null,
      },
      notes: order.notes,
    };
  }
}
