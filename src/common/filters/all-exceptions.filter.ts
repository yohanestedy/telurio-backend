import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      if (typeof exceptionResponse === 'object' && exceptionResponse !== null) {
        const resp = exceptionResponse as Record<string, unknown>;

        // Handle class-validator errors
        if (Array.isArray(resp.message)) {
          code = 'VALIDATION_ERROR';
          message = (resp.message as string[]).join('; ');
        } else if (resp.code && resp.message) {
          // Our custom exceptions pass { code, message }
          code = resp.code as string;
          message = resp.message as string;
        } else {
          code = this.statusToCode(status);
          message = (resp.message as string) || exception.message;
        }
      } else {
        code = this.statusToCode(status);
        message = exceptionResponse as string;
      }
    }

    response.status(status).json({
      error: { code, message },
    });
  }

  private statusToCode(status: number): string {
    switch (status) {
      case 400:
        return 'VALIDATION_ERROR';
      case 401:
        return 'UNAUTHORIZED';
      case 403:
        return 'FORBIDDEN';
      case 404:
        return 'NOT_FOUND';
      case 409:
        return 'CONFLICT';
      case 422:
        return 'BUSINESS_RULE_VIOLATION';
      default:
        return 'INTERNAL_ERROR';
    }
  }
}
