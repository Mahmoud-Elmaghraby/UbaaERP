/**
 * Default numbering for every document type the system issues. A new
 * tenant used to hit a raw 500 on its first invoice, receipt or journal
 * entry ("No numbering sequence configured") until someone created the
 * sequence by hand — found again while verifying inventory step 4 (every
 * automatic journal entry failed). NumberingSequencesService.allocateNext
 * now creates the tenant-wide sequence from this table on first use; a
 * tenant can still rename the prefix or reset the counter in
 * Settings › Numbering at any time, and a sequence it already defined is
 * never touched.
 */
export const DEFAULT_DOCUMENT_NUMBERING: Record<string, { prefix: string; paddingLength: number }> = {
  // Sales
  quotation: { prefix: 'QT-', paddingLength: 5 },
  sales_order: { prefix: 'SO-', paddingLength: 5 },
  delivery: { prefix: 'DN-', paddingLength: 5 },
  sales_invoice: { prefix: 'INV-', paddingLength: 5 },
  sales_return: { prefix: 'SR-', paddingLength: 5 },
  sales_credit_note: { prefix: 'CN-', paddingLength: 5 },
  payment_received: { prefix: 'RCV-', paddingLength: 5 },
  // Purchases
  purchase_requisition: { prefix: 'PRQ-', paddingLength: 5 },
  request_for_quotation: { prefix: 'RFQ-', paddingLength: 5 },
  purchase_order: { prefix: 'PO-', paddingLength: 5 },
  goods_receipt: { prefix: 'GRN-', paddingLength: 5 },
  purchase_invoice: { prefix: 'PINV-', paddingLength: 5 },
  purchase_return: { prefix: 'PRT-', paddingLength: 5 },
  // Inventory
  stock_transfer: { prefix: 'TRF-', paddingLength: 5 },
  stock_adjustment: { prefix: 'ADJ-', paddingLength: 5 },
  stock_count: { prefix: 'CNT-', paddingLength: 5 },
  stock_opening: { prefix: 'OPN-', paddingLength: 5 },
  // Accounting
  journal_entry: { prefix: 'JE-', paddingLength: 6 },
};
