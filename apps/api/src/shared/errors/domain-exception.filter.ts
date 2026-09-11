import {
  ArgumentsHost,
  Catch,
  ConflictException,
  ExceptionFilter,
  NotFoundException,
  UnauthorizedException,
  UnprocessableEntityException,
} from '@nestjs/common';
import {
  AuthenticationError,
  BusinessRuleError,
  ConflictError,
  LEGACY_ERROR_CODE,
  NotFoundError,
} from './domain-errors';
import { formatArMessage } from './error-messages.ar';

/**
 * Translates application-layer errors (see ./domain-errors.ts) into the
 * right NestJS HTTP status, in one place, for every module — keeps
 * controllers free of repetitive try/catch, and keeps the application
 * layer itself free of any NestJS/HTTP dependency (Clean Architecture
 * §2.1: dependencies point inward only).
 *
 * [مستقر — error i18n foundation, added 2026-09-11] The response body used
 * to be whatever NestJS's own exception class produced from the raw
 * English `message` (e.g. `{statusCode, message, error}`) — unexplained
 * to an Arabic-speaking user and with nothing a frontend could branch on
 * besides parsing English text. For a MIGRATED throw site (real `code`)
 * it is now `{statusCode, code, message}` where `message` is the Arabic
 * text from error-messages.ar.ts, plus `devMessage` (the original English
 * `message`) outside production for local debugging.
 *
 * A throw site that hasn't been migrated yet still has `code ===
 * LEGACY_ERROR_CODE` (domain-errors.ts's default) — for those, `message`
 * stays the original English text, unchanged, so existing callers/tests of
 * an as-yet-unmigrated module see no behavior change at all. Remove this
 * branch once every module is migrated and LEGACY_ERROR_CODE is retired.
 */
@Catch(NotFoundError, ConflictError, AuthenticationError, BusinessRuleError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(
    exception: NotFoundError | ConflictError | AuthenticationError | BusinessRuleError,
    host: ArgumentsHost,
  ): void {
    const status =
      exception instanceof NotFoundError
        ? new NotFoundException().getStatus()
        : exception instanceof AuthenticationError
          ? new UnauthorizedException().getStatus()
          : exception instanceof BusinessRuleError
            ? new UnprocessableEntityException().getStatus()
            : new ConflictException().getStatus();

    const isMigrated = exception.code !== LEGACY_ERROR_CODE;
    const response = host.switchToHttp().getResponse();
    response.status(status).json({
      statusCode: status,
      code: exception.code,
      message: isMigrated ? formatArMessage(exception.code, exception.params) : exception.message,
      ...(isMigrated && process.env.NODE_ENV !== 'production' ? { devMessage: exception.message } : {}),
    });
  }
}
