import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

/**
 * Recursively converts BigInt values to strings in API responses.
 * Also converts Decimal (Prisma) objects to strings.
 * Per PRD Section 4.6: money and decimal fields must be serialized as strings.
 */
@Injectable()
export class BigIntSerializerInterceptor implements NestInterceptor {
  intercept(
    _context: ExecutionContext,
    next: CallHandler,
  ): Observable<unknown> {
    return next.handle().pipe(map((data) => this.serialize(data)));
  }

  private serialize(value: unknown): unknown {
    if (value === null || value === undefined) {
      return value;
    }

    if (typeof value === 'bigint') {
      return value.toString();
    }

    // Prisma Decimal objects have a toFixed method
    if (
      typeof value === 'object' &&
      value !== null &&
      'toFixed' in value &&
      typeof (value as { toFixed: unknown }).toFixed === 'function'
    ) {
      return value.toString();
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    if (Array.isArray(value)) {
      return value.map((item) => this.serialize(item));
    }

    if (typeof value === 'object') {
      const serialized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        serialized[key] = this.serialize(val);
      }
      return serialized;
    }

    return value;
  }
}
