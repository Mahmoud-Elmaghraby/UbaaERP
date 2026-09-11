import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';
import { formatArMessage } from '../errors/error-messages.ar';

/**
 * Validates a request body against one of the shared Zod contracts
 * (@erp-platform/contracts) instead of class-validator DTOs — keeps
 * backend validation on the exact same schema the frontend will use with
 * zodResolver later (CLAUDE.md §2.9).
 *
 * [مستقر — error i18n foundation, added 2026-09-11] Previously threw
 * `result.error.flatten()` directly as the response body — Zod's raw,
 * English-only, developer-facing shape (`fieldErrors`/`formErrors`), with
 * no `code` and no Arabic text. Now returns the same envelope every other
 * error in the API uses (see domain-exception.filter.ts): a stable `code`,
 * an Arabic `message`, and the field-level detail (still useful for a form
 * to highlight individual inputs) under `fields`/`formErrors`.
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const { fieldErrors, formErrors } = result.error.flatten();
      throw new BadRequestException({
        statusCode: 400,
        code: 'VALIDATION.INVALID_INPUT',
        message: formatArMessage('VALIDATION.INVALID_INPUT'),
        fields: fieldErrors,
        formErrors,
      });
    }
    return result.data;
  }
}
