import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import { formatArMessage } from './error-messages.ar';

/**
 * Last-resort net, registered AFTER DomainExceptionFilter in main.ts
 * (Nest tries global filters in registration order and stops at the first
 * whose @Catch() types match — DomainExceptionFilter's specific classes
 * are checked first; this bare @Catch() matches everything else).
 *
 * Before this filter existed, anything that wasn't one of the four domain
 * errors — a genuine bug, an unhandled Postgres error, a NestJS guard's
 * ForbiddenException — fell through to Nest's built-in default handler:
 * an opaque, English-only `{statusCode, message, error}` with no `code` a
 * frontend could branch on, and (for a genuine 500) no guarantee the raw
 * error was ever logged anywhere useful. This is the concrete fix for the
 * "errors show up raw with no explanation" complaint for everything
 * outside the four domain-error types.
 *
 * Scope note: this wraps other NestJS HttpExceptions (guards, pipes not
 * yet migrated) in the same envelope shape but does NOT translate their
 * English `message` to Arabic — that would mean auditing every such site
 * individually, which is a separate, later pass. A true unexpected error
 * (the `else` branch) always gets a generic Arabic message; the real
 * detail goes to the server log only, never to the client.
 */
@Catch()
export class UnexpectedExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse();

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      // Already-structured bodies (our own {code, message, ...} shape,
      // e.g. ZodValidationPipe) pass through unchanged.
      if (typeof body === 'object' && body !== null && 'code' in body) {
        response.status(status).json(body);
        return;
      }
      const message =
        typeof body === 'object' && body !== null && 'message' in body
          ? (body as { message: unknown }).message
          : exception.message;
      response.status(status).json({ statusCode: status, code: `HTTP.${status}`, message });
      return;
    }

    // A genuine unexpected error (programming bug, unhandled DB driver
    // throw, etc.) — log the full detail server-side; the client only
    // ever receives a safe, generic, Arabic message plus a stable code.
    // eslint-disable-next-line no-console
    console.error('[UnexpectedExceptionFilter] unhandled exception:', exception);
    response.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: HttpStatus.INTERNAL_SERVER_ERROR,
      code: 'UNEXPECTED.INTERNAL_ERROR',
      message: formatArMessage('UNEXPECTED.INTERNAL_ERROR'),
    });
  }
}
