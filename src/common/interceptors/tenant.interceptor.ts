import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
  ForbiddenException,
} from '@nestjs/common';
import { Observable } from 'rxjs';

/**
 * Enforces that every authenticated request carries a churchId.
 * Downstream code can trust that req.user.churchId is always set.
 */
@Injectable()
export class TenantInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    if (request.user && !request.user.churchId) {
      throw new ForbiddenException('No church context');
    }

    return next.handle();
  }
}
