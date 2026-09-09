import { Controller, ForbiddenException, Get, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { RequestUser } from "../common/request-user.type";
import { RoleCode } from "../roles/role-codes";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { PermissionCode } from "../permissions/permission-codes";
import { AuditService } from "./audit.service";

@Controller("audit-log")
@Permissions(PermissionCode.AuditRead)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query("page") page: string | undefined, @Query("limit") limit: string | undefined, @Query("search") search: string | undefined, @Query("action") action: string | undefined, @Query("entityType") entityType: string | undefined, @Query("from") from: string | undefined, @Query("to") to: string | undefined, @CurrentUser() actor: RequestUser) {
    if (!actor.roles.includes(RoleCode.Admin)) throw new ForbiddenException("Journal complet réservé à l'Admin.");
    return this.auditService.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined,
      search, action, entityType, from, to
    });
  }
}
