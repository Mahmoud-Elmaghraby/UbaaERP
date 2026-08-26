import { ArgumentsHost, Catch, ConflictException, ExceptionFilter, NotFoundException } from '@nestjs/common';
import { ConflictError, NotFoundError } from './domain-errors';

/**
 * Translates application-layer errors (see ./domain-errors.ts) into the
 * right NestJS HTTP exception, in one place, for every module — keeps
 * controllers free of repetitive try/catch, and keeps the application
 * layer itself free of any NestJS/HTTP dependency (Clean Architecture
 * §2.1: dependencies point inward only).
 */
@Catch(NotFoundError, ConflictError)
export class DomainExceptionFilter implements ExceptionFilter {
  catch(exception: NotFoundError | ConflictError, host: ArgumentsHost): void {
    const httpException =
      exception instanceof NotFoundError
        ? new NotFoundException(exception.message)
        : new ConflictException(exception.message);

    const response = host.switchToHttp().getResponse();
    const status = httpException.getStatus();
    response.status(status).json(httpException.getResponse());
  }
}
