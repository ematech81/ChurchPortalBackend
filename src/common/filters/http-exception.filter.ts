import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

/** Postgres error codes caused by bad client input, mapped to 4xx instead of 500. */
const PG_CLIENT_ERRORS: Record<string, { status: number; message: string }> = {
  '22P02': { status: HttpStatus.BAD_REQUEST, message: 'Invalid value in request.' }, // bad enum / uuid / number
  '22003': { status: HttpStatus.BAD_REQUEST, message: 'A number in the request is out of range.' },
  '22007': { status: HttpStatus.BAD_REQUEST, message: 'Invalid date in request.' },
  '22008': { status: HttpStatus.BAD_REQUEST, message: 'Invalid date in request.' },
  '23502': { status: HttpStatus.BAD_REQUEST, message: 'A required field is missing.' },
  '23503': { status: HttpStatus.BAD_REQUEST, message: 'Referenced record does not exist.' },
  '23505': { status: HttpStatus.CONFLICT, message: 'A record with these details already exists.' },
};

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    // Clients read `message`, and for structured errors also `code`, `detail`,
    // `lockedUntil`, `remainingSeconds` — so object bodies are passed through as-is.
    let body: Record<string, unknown> = { message: 'Internal server error' };

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      body = typeof res === 'string' ? { message: res } : { ...(res as object) };
    } else {
      const pgCode = (exception as any)?.driverError?.code as string | undefined;
      const mapped = pgCode ? PG_CLIENT_ERRORS[pgCode] : undefined;
      if (mapped) {
        status = mapped.status;
        body = { message: mapped.message };
        this.logger.warn(`DB input error ${pgCode} on ${request.method} ${request.url}`);
      }
    }

    if (status >= 500) this.logger.error(exception);

    response.status(status).json({
      statusCode: status,
      ...body,
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }
}
