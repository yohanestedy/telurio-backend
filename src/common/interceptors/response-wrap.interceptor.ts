import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable, map } from 'rxjs';

export interface WrappedResponse<T> {
  data: T;
  meta?: { total: number; page: number; limit: number };
}

@Injectable()
export class ResponseWrapInterceptor<T> implements NestInterceptor<
  T,
  WrappedResponse<T>
> {
  intercept(
    _context: ExecutionContext,
    next: CallHandler<T>,
  ): Observable<WrappedResponse<T>> {
    return next.handle().pipe(
      map((payload) => {
        // If the service already returned { data, meta } shape, pass through
        if (
          payload &&
          typeof payload === 'object' &&
          'data' in (payload as object)
        ) {
          return payload as unknown as WrappedResponse<T>;
        }
        return { data: payload };
      }),
    );
  }
}
