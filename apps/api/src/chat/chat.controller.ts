import { Body, Controller, Get, Param, Patch, Post } from "@nestjs/common";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { ChatService } from "./chat.service";

@Controller("chat")
export class ChatController {
  constructor(private readonly chat: ChatService) {}

  @Get("users")
  @Permissions(PermissionCode.ReportsRead)
  users(@CurrentUser() user: RequestUser) {
    return this.chat.listUsers(user);
  }

  @Get("conversations")
  @Permissions(PermissionCode.ReportsRead)
  conversations(@CurrentUser() user: RequestUser) {
    return this.chat.conversations(user);
  }

  @Post("conversations/direct")
  @Permissions(PermissionCode.ReportsRead)
  createDirect(@Body() dto: { userId: string }, @CurrentUser() user: RequestUser) {
    return this.chat.createDirect(dto.userId, user);
  }

  @Post("conversations/group")
  @Permissions(PermissionCode.ReportsRead)
  createGroup(@Body() dto: { name?: string; userIds?: string[] }, @CurrentUser() user: RequestUser) {
    return this.chat.createGroup(dto, user);
  }

  @Get("conversations/:id/messages")
  @Permissions(PermissionCode.ReportsRead)
  messages(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.chat.messages(id, user);
  }

  @Post("conversations/:id/messages")
  @Permissions(PermissionCode.ReportsRead)
  send(@Param("id") id: string, @Body() dto: { content?: string }, @CurrentUser() user: RequestUser) {
    return this.chat.sendMessage(id, dto.content, user);
  }

  @Patch("conversations/:id/read")
  @Permissions(PermissionCode.ReportsRead)
  markRead(@Param("id") id: string, @CurrentUser() user: RequestUser) {
    return this.chat.markRead(id, user);
  }
}
