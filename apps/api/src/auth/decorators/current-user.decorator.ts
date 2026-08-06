import { createParamDecorator, ExecutionContext } from "@nestjs/common";
import { RequestWithUser } from "../../common/request-with-user.type";

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest<RequestWithUser>();
  return request.user;
});
