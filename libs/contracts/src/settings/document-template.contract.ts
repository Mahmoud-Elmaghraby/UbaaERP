import { z } from 'zod';

export const documentTemplateSchema = z.object({
  id: z.string().uuid(),
  documentType: z.string().min(1),
  name: z.string().min(1),
  content: z.string(),
  isDefault: z.boolean(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type DocumentTemplateDto = z.infer<typeof documentTemplateSchema>;

export const createDocumentTemplateSchema = z.object({
  documentType: z.string().min(1),
  name: z.string().min(1),
  content: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type CreateDocumentTemplateDto = z.infer<typeof createDocumentTemplateSchema>;

export const updateDocumentTemplateSchema = z.object({
  name: z.string().min(1).optional(),
  content: z.string().optional(),
  isDefault: z.boolean().optional(),
});
export type UpdateDocumentTemplateDto = z.infer<typeof updateDocumentTemplateSchema>;
