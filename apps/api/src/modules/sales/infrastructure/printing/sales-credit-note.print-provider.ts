import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { documentTotalsDto, lineTaxesDto, moneyDto, readPrintLabels } from '../../../../shared/printing/print-helpers';
import { SalesCreditNotesService } from '../../application/services/sales-credit-notes.service';
import { SALES_RETURN_REPOSITORY, type SalesReturnRepository } from '../../application/ports/sales-return.repository';
import { DELIVERY_REPOSITORY, type DeliveryRepository } from '../../application/ports/delivery.repository';
import { SALES_ORDER_REPOSITORY, type SalesOrderRepository } from '../../application/ports/sales-order.repository';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import { customerParty } from './sales-print-shared';

/**
 * إشعار دائن — auto-generated on confirming a sales return; it has no
 * status lifecycle, so it always prints as final.
 */
@Injectable()
export class SalesCreditNotePrintProvider implements PrintProvider {
  readonly documentType = 'sales_credit_note';
  readonly label = 'إشعار دائن';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(
    private readonly creditNotes: SalesCreditNotesService,
    @Inject(SALES_RETURN_REPOSITORY) private readonly returns: SalesReturnRepository,
    @Inject(DELIVERY_REPOSITORY) private readonly deliveries: DeliveryRepository,
    @Inject(SALES_ORDER_REPOSITORY) private readonly orders: SalesOrderRepository,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const creditNote = await this.creditNotes.getById(db, id);
    const [salesReturn, customer] = await Promise.all([
      this.returns.findById(db, creditNote.salesReturnId),
      this.customers.findById(db, creditNote.customerId),
    ]);
    const delivery = salesReturn ? await this.deliveries.findById(db, salesReturn.deliveryId) : null;
    const order = delivery ? await this.orders.findById(db, delivery.salesOrderId) : null;
    const currency = creditNote.currency;
    const labels = await readPrintLabels(
      db,
      creditNote.lines.map((line) => line.productVariantId),
      creditNote.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: creditNote.id,
      title: 'إشعار دائن',
      number: creditNote.creditNoteNumber,
      status: null,
      statusLabel: null,
      date: localIsoDate(creditNote.createdAt),
      currency,
      party: customer ? customerParty(customer) : null,
      fields: [
        ...(salesReturn ? [{ label: 'مرتجع المبيعات', value: salesReturn.returnNumber }] : []),
        ...(delivery ? [{ label: 'إذن التسليم', value: delivery.deliveryNumber }] : []),
        ...(order ? [{ label: 'أمر البيع', value: order.soNumber }] : []),
      ],
      lines: creditNote.lines.map((line) => {
        const label = labels.variant(line.productVariantId);
        return {
          description: label.name,
          sku: label.sku,
          quantity: line.quantity,
          unit: labels.unit(line.unitOfMeasureId, line.productVariantId),
          unitPrice: moneyDto(line.unitPrice),
          amount: moneyDto(line.netAmount),
          taxes: lineTaxesDto(line.taxes, currency),
        };
      }),
      totals: documentTotalsDto(creditNote),
      notes: creditNote.notes,
    };
  }
}
