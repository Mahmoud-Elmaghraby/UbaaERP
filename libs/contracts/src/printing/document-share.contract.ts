import { z } from 'zod';

/** Documents that can be shared by a public signed link (WhatsApp share). */
export const shareableDocumentTypeSchema = z.enum(['sales_invoice', 'payment_received']);
export type ShareableDocumentTypeDto = z.infer<typeof shareableDocumentTypeSchema>;

/** POST /sales-invoices/:id/share-link, POST /payments-received/:id/share-link. */
export const documentShareLinkSchema = z.object({
  /** Public web page that renders the document without login (/share/:token). */
  url: z.string(),
  token: z.string(),
  expiresAt: z.string(),
});
export type DocumentShareLinkDto = z.infer<typeof documentShareLinkSchema>;
