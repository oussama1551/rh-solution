import { Controller, Get, Param, Patch, Post, Query } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { NotificationsService } from "./notifications.service";

@Controller("notifications")
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  @Get()
  @Permissions(PermissionCode.ReportsRead)
  list(@CurrentUser() user: RequestUser, @Query() query: { unread?: string; page?: string; limit?: string }) {
    return this.notifications.list(user, query);
  }

  @Get("unread-count")
  @Permissions(PermissionCode.ReportsRead)
  unreadCount(@CurrentUser() user: RequestUser) {
    return this.notifications.unreadCount(user);
  }

  @Get("menu-counts")
  @Permissions(PermissionCode.ReportsRead)
  menuCounts(@CurrentUser() user: RequestUser) {
    return this.notifications.menuCounts(user);
  }

  @Patch(":id/read")
  @Permissions(PermissionCode.ReportsRead)
  markRead(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.notifications.markRead(id, user);
  }

  @Post("mark-all-read")
  @Permissions(PermissionCode.ReportsRead)
  markAllRead(@CurrentUser() user: RequestUser) {
    return this.notifications.markAllRead(user);
  }
}
