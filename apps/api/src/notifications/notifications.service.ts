import { Injectable, NotFoundException } from "@nestjs/common";
import { NotificationType, Prisma } from "@prisma/client";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";

export type NotifyPayload = {
  title: string;
  message: string;
  entityType?: string | null;
  entityId?: string | null;
};

@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  async notify(recipientUserIds: Array<string | null | undefined>, type: NotificationType, payload: NotifyPayload) {
    const uniqueIds = [...new Set(recipientUserIds.filter(Boolean) as string[])];
    if (!uniqueIds.length) return { count: 0 };
    await this.prisma.notification.createMany({
      data: uniqueIds.map(recipientUserId => ({
        recipientUserId,
        type,
        title: payload.title,
        message: payload.message,
        entityType: payload.entityType || null,
        entityId: payload.entityId || null
      })),
      skipDuplicates: false
    });
    return { count: uniqueIds.length };
  }

  async adminDrhUserIds() {
    return this.userIdsByRoles([RoleCode.Admin, RoleCode.DRH]);
  }

  async adminItUserIds() {
    return this.userIdsByRoles([RoleCode.Admin, RoleCode.IT]);
  }

  async userIdsByRoles(roles: string[]) {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, roles: { some: { role: { code: { in: roles } } } } },
      select: { id: true }
    });
    return users.map(user => user.id);
  }

  async list(actor: RequestUser, query: { unread?: string; page?: string; limit?: string }) {
    const page = positiveInt(query.page, 1);
    const limit = Math.min(positiveInt(query.limit, 20), 100);
    const where: Prisma.NotificationWhereInput = { recipientUserId: actor.id };
    if (query.unread === "true") where.isRead = false;
    if (query.unread === "false") where.isRead = true;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.notification.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (page - 1) * limit,
        take: limit
      }),
      this.prisma.notification.count({ where })
    ]);
    return { items, total, page, limit };
  }

  unreadCount(actor: RequestUser) {
    return this.prisma.notification.count({ where: { recipientUserId: actor.id, isRead: false } }).then(count => ({ count }));
  }

  async menuCounts(actor: RequestUser) {
    const [notifications, chat] = await Promise.all([
      this.prisma.notification.count({ where: { recipientUserId: actor.id, isRead: false } }),
      this.chatUnreadCount(actor.id)
    ]);
    const canApprove = actor.roles.includes(RoleCode.Admin) || actor.roles.includes(RoleCode.DRH);
    const validation = canApprove
      ? await this.prisma.notification.count({ where: { recipientUserId: actor.id, isRead: false, type: NotificationType.PENDING_APPROVAL } })
      : 0;
    return { notifications, validation, messages: chat };
  }

  async markRead(id: string, actor: RequestUser) {
    const row = await this.prisma.notification.updateMany({
      where: { id, recipientUserId: actor.id },
      data: { isRead: true }
    });
    if (!row.count) throw new NotFoundException("Notification introuvable.");
    return { read: true };
  }

  async markAllRead(actor: RequestUser) {
    const result = await this.prisma.notification.updateMany({
      where: { recipientUserId: actor.id, isRead: false },
      data: { isRead: true }
    });
    return { count: result.count };
  }

  private async chatUnreadCount(userId: string) {
    const participants = await this.prisma.chatParticipant.findMany({
      where: { userId },
      select: { conversationId: true, lastReadAt: true }
    });
    if (!participants.length) return 0;
    const counts = await Promise.all(participants.map(participant => this.prisma.chatMessage.count({
      where: {
        conversationId: participant.conversationId,
        senderId: { not: userId },
        createdAt: participant.lastReadAt ? { gt: participant.lastReadAt } : { gte: participant.lastReadAt || new Date(0) }
      }
    })));
    return counts.reduce((sum, count) => sum + count, 0);
  }
}

function positiveInt(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
