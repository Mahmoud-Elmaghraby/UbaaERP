import { BadRequestException, type PipeTransform } from '@nestjs/common';
import type { ZodSchema } from 'zod';

/**
 * Validates a request body against one of the shared Zod contracts
 * (@erp-platform/contracts) instead of class-validator DTOs — keeps
 * backend validation on the exact same schema the frontend will use with
 * zodResolver later (CLAUDE.md §2.9).
 */
export class ZodValidationPipe implements PipeTransform {
  constructor(private readonly schema: ZodSchema) {}

  transform(value: unknown): unknown {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new BadRequestException(result.error.flatten());
    }
    return result.data;
  }
}
