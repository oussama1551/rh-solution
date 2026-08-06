import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { RequestWithUser } from "../../common/request-with-user.type";
import { IS_PUBLIC_KEY } from "../decorators/public.decorator";
import { PERMISSIONS_KEY } from "../decorators/permissions.decorator";

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass()
    ]) || [];
    if (!required.length) return true;

    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const userPermissions = new Set(request.user?.permissions || []);
    const allowed = required.every(permission => userPermissions.has(permission));
    if (!allowed) throw new ForbiddenException("Permission insuffisante.");
    return true;
  }
}
