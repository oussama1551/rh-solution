import { Controller, Get, Query } from "@nestjs/common";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { PermissionCode } from "../permissions/permission-codes";
import { AuditService } from "./audit.service";

@Controller("audit-log")
@Permissions(PermissionCode.AuditRead)
export class AuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get()
  list(@Query("page") page?: string, @Query("limit") limit?: string) {
    return this.auditService.list({
      page: page ? Number(page) : undefined,
      limit: limit ? Number(limit) : undefined
    });
  }
}
