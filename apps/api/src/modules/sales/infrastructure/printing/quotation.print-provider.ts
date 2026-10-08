import { localIsoDate } from '../../../../shared/time/local-date';
import { Inject, Injectable } from '@nestjs/common';
import type { Kysely } from 'kysely';
import type { TenantDatabase } from '../../../../database/tenant/kysely-client';
import type { PrintDocumentBody, PrintProvider } from '../../../../shared/printing/print-provider';
import { amountTotalsDto, moneyDto, readPrintLabels, statusLabel } from '../../../../shared/printing/print-helpers';
import { QuotationsService } from '../../application/services/quotations.service';
import { CUSTOMER_REPOSITORY, type CustomerRepository } from '../../application/ports/customer.repository';
import { customerParty } from './sales-print-shared';

/** عرض سعر — prices only (quotations carry no taxes yet). */
@Injectable()
export class QuotationPrintProvider implements PrintProvider {
  readonly documentType = 'quotation';
  readonly label = 'عرض سعر';
  readonly paperSizes = ['a4'] as PrintProvider['paperSizes'];
  readonly permissions = ['sales.manage'];

  constructor(
    private readonly quotations: QuotationsService,
    @Inject(CUSTOMER_REPOSITORY) private readonly customers: CustomerRepository,
  ) {}

  async build(db: Kysely<TenantDatabase>, id: string): Promise<PrintDocumentBody> {
    const quotation = await this.quotations.getById(db, id);
    const customer = await this.customers.findById(db, quotation.customerId);
    const labels = await readPrintLabels(
      db,
      quotation.lines.map((line) => line.productVariantId),
      quotation.lines.map((line) => line.unitOfMeasureId),
    );
    return {
      id: quotation.id,
      title: 'عرض سعر',
      number: quotation.quotationNumber,
      status: quotation.status,
      statusLabel: statusLabel(quotation.status),
      date: localIsoDate(quotation.createdAt),
      currency: quotation.totalAmount.currency,
      party: customer ? customerParty(customer) : null,
      fields: quotation.validUntilDate ? [{ label: 'صالح حتى', value: quotation.validUntilDate }] : [],
      lines: quotation.lines.map((line) => {
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
      totals: amountTotalsDto(quotation.totalAmount),
      notes: quotation.notes,
    };
  }
}
