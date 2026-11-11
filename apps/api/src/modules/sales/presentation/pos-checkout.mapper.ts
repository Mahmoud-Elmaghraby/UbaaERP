import { posCheckoutResultSchema, type PosCheckoutDto, type PosCheckoutResultDto } from '@erp-platform/contracts';
import type { PosCheckoutInput, PosCheckoutResult } from '../domain/pos-sale.entity';
import { moneyFromDto } from './money.mapper';
import { orderWithLinesToDto } from './sales-orders.controller';
import { deliveryWithLinesToDto } from './deliveries.controller';
import { invoiceWithLinesToDto } from './sales-invoices.controller';
import { paymentWithAllocationsToDto } from './payments-received.controller';

/** POS checkout body → the service input (shared by checkout and exchange). */
export function checkoutInputFromDto(body: PosCheckoutDto): PosCheckoutInput {
  return {
    customerId: body.customerId,
    lines: body.lines.map((line) => ({
      productVariantId: line.productVariantId,
      unitOfMeasureId: line.unitOfMeasureId ?? null,
      quantity: line.quantity,
      unitPrice: moneyFromDto(line.unitPrice),
      discountType: line.discountType,
      discountPercentage: line.discountPercentage,
      discountFixedAmount: line.discountFixedAmount ? moneyFromDto(line.discountFixedAmount) : line.discountFixedAmount,
      notes: line.notes,
    })),
    discountType: body.discountType,
    discountPercentage: body.discountPercentage,
    discountFixedAmount: body.discountFixedAmount ? moneyFromDto(body.discountFixedAmount) : body.discountFixedAmount,
    tenders: body.tenders.map((tender) => ({
      paymentMethod: tender.paymentMethod,
      amount: moneyFromDto(tender.amount),
      referenceNumber: tender.referenceNumber,
      treasuryId: tender.treasuryId ?? null,
    })),
    notes: body.notes,
    checkoutId: body.checkoutId ?? null,
    approvalPin: body.approvalPin ?? null,
  };
}

export function checkoutResultToDto(result: PosCheckoutResult): PosCheckoutResultDto {
  return posCheckoutResultSchema.parse({
    salesOrder: orderWithLinesToDto(result.salesOrder),
    delivery: deliveryWithLinesToDto(result.delivery),
    salesInvoice: invoiceWithLinesToDto(result.salesInvoice),
    payments: result.payments.map(paymentWithAllocationsToDto),
    changeAmount: { amountMinorUnits: result.changeAmount.toMinorUnits().toString(), currency: result.changeAmount.currency },
  });
}
