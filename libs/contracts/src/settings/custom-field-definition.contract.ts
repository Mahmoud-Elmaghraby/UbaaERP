import { z } from 'zod';

export const customFieldTypeSchema = z.enum(['text', 'number', 'date', 'list']);

export const customFieldDefinitionSchema = z.object({
  id: z.string().uuid(),
  entityType: z.string().min(1),
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  fieldType: customFieldTypeSchema,
  options: z.array(z.string()).nullable(),
  isRequired: z.boolean(),
  displayOrder: z.number().int(),
  createdAt: z.coerce.date(),
  updatedAt: z.coerce.date(),
});
export type CustomFieldDefinitionDto = z.infer<typeof customFieldDefinitionSchema>;

export const createCustomFieldDefinitionSchema = z.object({
  entityType: z.string().min(1),
  fieldKey: z.string().min(1),
  label: z.string().min(1),
  fieldType: customFieldTypeSchema,
  options: z.array(z.string()).nullable().optional(),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});
export type CreateCustomFieldDefinitionDto = z.infer<typeof createCustomFieldDefinitionSchema>;

export const updateCustomFieldDefinitionSchema = z.object({
  label: z.string().min(1).optional(),
  fieldType: customFieldTypeSchema.optional(),
  options: z.array(z.string()).nullable().optional(),
  isRequired: z.boolean().optional(),
  displayOrder: z.number().int().optional(),
});
export type UpdateCustomFieldDefinitionDto = z.infer<typeof updateCustomFieldDefinitionSchema>;
