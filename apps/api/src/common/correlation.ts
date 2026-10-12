import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

export const CORRELATION_HEADER = 'x-correlation-id';

export function correlationMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header(CORRELATION_HEADER);
  const id = incoming && /^[A-Za-z0-9-]{8,64}$/.test(incoming) ? incoming : randomUUID();
  (req as Request & { correlationId: string }).correlationId = id;
  res.setHeader(CORRELATION_HEADER, id);
  next();
}

/** Structured errors with correlation IDs. Unexpected errors never expose internals. */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger('Error');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { correlationId?: string }>();
    const res = ctx.getResponse<Response>();
    const correlationId = req.correlationId ?? randomUUID();
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const body = exception.getResponse();
      const details = typeof body === 'string' ? { message: body } : body;
      res.status(status).json({ ...details, statusCode: status, correlationId });
      return;
    }
    // Log only type + message; never request bodies, cookies or headers.
    const err = exception instanceof Error ? `${exception.name}: ${exception.message}` : 'unknown';
    this.logger.error(`[${correlationId}] ${req.method} ${req.path} failed: ${err}`);
    res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
      statusCode: 500,
      message: 'Internal error',
      correlationId,
    });
  }
}
