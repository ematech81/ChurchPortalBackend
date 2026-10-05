import { createParamDecorator, ExecutionContext, ForbiddenException } from '@nestjs/common';

/**
 * Returns the caller's churchId. Throws if the user has no church yet — TypeORM
 * silently drops `undefined` where-conditions, so a missing churchId must never
 * reach a query (it would match every tenant).
 */
export const ChurchId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    const churchId = request.user?.churchId;
    if (!churchId) throw new ForbiddenException('Complete church setup first.');
    return churchId;
  },
);
