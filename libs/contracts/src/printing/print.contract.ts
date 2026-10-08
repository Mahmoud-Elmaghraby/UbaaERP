import { z } from 'zod';
import { moneySchema } from '../inventory/money.contract';

/**
 * Central print service: every printable document (sales/purchase invoices,
 * receipts, orders, delivery notes…) is turned by its module into ONE common
 * shape — PrintDocument — and rendered by ONE set of layouts (A4, thermal
 * 80 mm). A new printable document only needs a provider that fills this.
 */

export const paperSizeSchema = z.enum(['a4', 'thermal80']);
export type PaperSizeDto = z.infer<typeof paperSizeSchema>;

/** What a tenant can change per document type (stored as JSON in document_templates.content). */
export const printTemplateConfigSchema = z.object({
  paperSize: paperSizeSchema.default('a4'),
  /** Overrides the document's default title (e.g. "فاتورة ضريبية"). */
  title: z.string().max(80).nullable().default(null),
  showLogo: z.boolean().default(true),
  accentColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .default('#0f766e'),
  showSku: z.boolean().default(true),
  showUnit: z.boolean().default(true),
  showTaxDetails: z.boolean().default(true),
  showAmountInWords: z.boolean().default(true),
  showSignatures: z.boolean().default(true),
  headerNote: z.string().max(500).nullable().default(null),
  termsText: z.string().max(2000).nullable().default(null),
  footerText: z.string().max(500).nullable().default(null),
});
export type PrintTemplateConfigDto = z.infer<typeof printTemplateConfigSchema>;

export const printCompanySchema = z.object({
  name: z.string().nullable(),
  address: z.string().nullable(),
  taxRegistrationNumber: z.string().nullable(),
  commercialRegister: z.string().nullable(),
  phone: z.string().nullable(),
  email: z.string().nullable(),
  website: z.string().nullable(),
  logoUrl: z.string().nullable(),
});
export type PrintCompanyDto = z.infer<typeof printCompanySchema>;

export const printPartySchema = z.object({
  /** "العميل" / "المورد" … */
  roleLabel: z.string(),
  name: z.string(),
  code: z.string().nullable().optional(),
  taxNumber: z.string().nullable().optional(),
  address: z.string().nullable().optional(),
  phone: z.string().nullable().optional(),
});
export type PrintPartyDto = z.infer<typeof printPartySchema>;

/** Extra header facts ("أمر البيع: SO-00012", "المخزن: الرئيسي"). */
export const printFieldSchema = z.object({ label: z.string(), value: z.string() });
export type PrintFieldDto = z.infer<typeof printFieldSchema>;

export const printLineTaxSchema = z.object({
  name: z.string(),
  kind: z.enum(['vat', 'table', 'withholding']),
  rate: z.string(),
  amount: moneySchema,
});

/** One printed row — a product line, or e.g. an allocation on a receipt (description + amount only). */
export const printLineSchema = z.object({
  description: z.string(),
  sku: z.string().nullable().optional(),
  details: z.string().nullable().optional(),
  quantity: z.number().nullable().optional(),
  unit: z.string().nullable().optional(),
  unitPrice: moneySchema.nullable().optional(),
  /** Line amount before taxes. */
  amount: moneySchema.nullable().optional(),
  taxes: z.array(printLineTaxSchema).optional(),
});
export type PrintLineDto = z.infer<typeof printLineSchema>;

export const printTotalsSchema = z.object({
  netAmount: moneySchema.nullable().optional(),
  discountAmount: moneySchema.nullable().optional(),
  tableTaxAmount: moneySchema.nullable().optional(),
  vatAmount: moneySchema.nullable().optional(),
  withholdingAmount: moneySchema.nullable().optional(),
  totalAmount: moneySchema,
  paidAmount: moneySchema.nullable().optional(),
  balanceAmount: moneySchema.nullable().optional(),
  amountInWords: z.string().nullable().optional(),
});
export type PrintTotalsDto = z.infer<typeof printTotalsSchema>;

/**
 * Account statements (كشف حساب): instead of product lines, a running ledger —
 * opening balance, one row per document with its increase/decrease and the
 * running balance, then the closing balance. Rendered by the same layouts.
 */
export const printLedgerRowSchema = z.object({
  date: z.string(),
  description: z.string(),
  number: z.string(),
  reference: z.string().nullable(),
  increase: moneySchema.nullable(),
  decrease: moneySchema.nullable(),
  balance: moneySchema,
});
export const printLedgerSchema = z.object({
  increaseLabel: z.string(),
  decreaseLabel: z.string(),
  openingBalance: moneySchema,
  rows: z.array(printLedgerRowSchema),
  totalIncrease: moneySchema,
  totalDecrease: moneySchema,
  closingBalance: moneySchema,
  /** "الرصيد المستحق على العميل" … */
  closingLabel: z.string(),
});
export type PrintLedgerDto = z.infer<typeof printLedgerSchema>;

export const printDocumentSchema = z.object({
  documentType: z.string(),
  id: z.string(),
  /** Default title, e.g. "فاتورة ضريبية" (the template may override it). */
  title: z.string(),
  number: z.string(),
  status: z.string().nullable(),
  /** Arabic status label when the document isn't final ("مسودة", "ملغاة"). */
  statusLabel: z.string().nullable(),
  date: z.string().nullable(),
  dueDate: z.string().nullable().optional(),
  currency: z.string(),
  company: printCompanySchema,
  party: printPartySchema.nullable(),
  fields: z.array(printFieldSchema),
  lines: z.array(printLineSchema),
  totals: printTotalsSchema.nullable(),
  notes: z.string().nullable(),
  /** Statements only — replaces `lines`/`totals`. */
  ledger: printLedgerSchema.nullable().optional(),
  /** Which paper sizes this document type supports (a receipt fits a thermal roll; a PO doesn't). */
  paperSizes: z.array(paperSizeSchema),
});
export type PrintDocumentDto = z.infer<typeof printDocumentSchema>;

/** GET /print/:documentType/:id — the document plus the template to render it with. */
export const printResponseSchema = z.object({
  document: printDocumentSchema,
  template: printTemplateConfigSchema,
});
export type PrintResponseDto = z.infer<typeof printResponseSchema>;

/** The printable document types and their Arabic names (Settings › print templates). */
export const printableDocumentTypeSchema = z.object({
  documentType: z.string(),
  label: z.string(),
  paperSizes: z.array(paperSizeSchema),
});
export type PrintableDocumentTypeDto = z.infer<typeof printableDocumentTypeSchema>;
