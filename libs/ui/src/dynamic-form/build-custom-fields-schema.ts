import { z, type ZodTypeAny } from 'zod';
import type { CustomFieldDefinitionDto } from '@erp-platform/contracts';

/**
 * Dynamic form engine (CLAUDE.md §7): builds a Zod schema for a single
 * entity's custom_fields JSONB blob from its backend-defined
 * CustomFieldDefinitionDto[]. The result is meant to be merged into the
 * entity's own base Zod schema (e.g. `baseSchema.extend({ customFields:
 * buildCustomFieldsSchema(definitions) })`) so react-hook-form validates
 * both static and dynamic fields through a single zodResolver.
 */
export function buildCustomFieldsSchema(definitions: CustomFieldDefinitionDto[]) {
  const shape: Record<string, ZodTypeAny> = {};

  for (const def of definitions) {
    shape[def.fieldKey] = fieldSchema(def);
  }

  return z.object(shape);
}

function fieldSchema(def: CustomFieldDefinitionDto): ZodTypeAny {
  let schema: ZodTypeAny;

  switch (def.fieldType) {
    case 'text':
      schema = z.string();
      if (def.isRequired) {
        schema = (schema as z.ZodString).min(1, { message: `${def.label} مطلوب` });
      }
      break;
    case 'number':
      schema = z.coerce.number({ invalid_type_error: `${def.label} يجب أن يكون رقمًا` });
      break;
    case 'date':
      schema = z.coerce.date({ invalid_type_error: `${def.label} يجب أن يكون تاريخًا صحيحًا` });
      break;
    case 'list': {
      const options = def.options ?? [];
      schema = options.length > 0 ? z.enum(options as [string, ...string[]]) : z.string();
      break;
    }
    default:
      schema = z.unknown();
  }

  if (!def.isRequired) {
    schema = schema.optional().nullable();
  }

  return schema;
}
