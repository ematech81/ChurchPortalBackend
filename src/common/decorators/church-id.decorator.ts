import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const ChurchId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string => {
    const request = ctx.switchToHttp().getRequest();
    return request.user?.churchId;
  },
);
