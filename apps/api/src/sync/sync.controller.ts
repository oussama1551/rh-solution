import { Controller, Get, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { BioTimeLicenseService } from "./biotime-license.service";
import { SyncService } from "./sync.service";

@Controller("sync")
export class SyncController {
  constructor(
    private readonly sync: SyncService,
    private readonly license: BioTimeLicenseService
  ) {}

  @Get("state")
  @Permissions(PermissionCode.ReportsRead)
  state() {
    return this.sync.state();
  }

  @Get("logs")
  @Permissions(PermissionCode.SyncRun)
  logs(@Query("limit") limit?: string) {
    return this.sync.history(limit ? Number(limit) : 50);
  }

  @Post("run")
  @Permissions(PermissionCode.SyncRun)
  run(@CurrentUser() user: RequestUser) {
    return this.sync.run("manual", user.id, { full: true });
  }

  @Post("reactivate-biotime-license")
  @Permissions(PermissionCode.SyncRun)
  reactivateLicense() {
    return this.license.reactivate();
  }

  @Post("backfill-punches")
  @Permissions(PermissionCode.SyncRun)
  backfillPunches(
    @Query("from") from: string,
    @Query("to") to: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.sync.backfillPunches(from, to, user.id);
  }

  @Post("employee-punch-sweep")
  @Permissions(PermissionCode.SyncRun)
  employeePunchSweep(
    @Query("from") from: string,
    @Query("to") to: string,
    @CurrentUser() user: RequestUser
  ) {
    return this.sync.employeePunchSweep(from, to, user.id);
  }
}
