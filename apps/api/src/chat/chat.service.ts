import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ChatConversationType, NotificationType, Prisma } from "@prisma/client";
import { RequestUser } from "../common/request-user.type";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ChatService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService
  ) {}

  listUsers(actor: RequestUser) {
    return this.prisma.user.findMany({
      where: { isActive: true, id: { not: actor.id } },
      orderBy: { fullName: "asc" },
      select: { id: true, username: true, fullName: true }
    });
  }

  async conversations(actor: RequestUser) {
    const rows = await this.prisma.chatConversation.findMany({
      where: { participants: { some: { userId: actor.id } } },
      orderBy: { createdAt: "desc" },
      include: {
        participants: { include: { user: { select: { id: true, username: true, fullName: true } } } },
        messages: { orderBy: { createdAt: "desc" }, take: 1, include: { sender: { select: { id: true, username: true, fullName: true } } } }
      }
    });
    const selfParticipants = await this.prisma.chatParticipant.findMany({
      where: { userId: actor.id, conversationId: { in: rows.map(row => row.id) } },
      select: { conversationId: true, lastReadAt: true }
    });
    const readMap = new Map(selfParticipants.map(row => [row.conversationId, row.lastReadAt]));
    return Promise.all(rows.map(async row => ({
      id: row.id,
      type: row.type,
      name: this.displayName(row, actor.id),
      createdAt: row.createdAt,
      participants: row.participants.map(participant => participant.user),
      lastMessage: row.messages[0] || null,
      unreadCount: await this.prisma.chatMessage.count({
        where: {
          conversationId: row.id,
          senderId: { not: actor.id },
          createdAt: readMap.get(row.id) ? { gt: readMap.get(row.id)! } : { gte: new Date(0) }
        }
      })
    })));
  }

  async messages(conversationId: string, actor: RequestUser) {
    await this.ensureParticipant(conversationId, actor.id);
    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: "asc" },
      take: 300,
      include: { sender: { select: { id: true, username: true, fullName: true } } }
    });
  }

  async createDirect(otherUserId: string, actor: RequestUser) {
    if (otherUserId === actor.id) throw new BadRequestException("Impossible de créer une conversation avec soi-même.");
    const other = await this.prisma.user.findFirst({ where: { id: otherUserId, isActive: true }, select: { id: true } });
    if (!other) throw new NotFoundException("Utilisateur introuvable.");

    const candidates = await this.prisma.chatConversation.findMany({
      where: {
        type: ChatConversationType.DIRECT,
        participants: { every: { userId: { in: [actor.id, otherUserId] } } }
      },
      include: { participants: true }
    });
    const existing = candidates.find(row => row.participants.length === 2 && row.participants.some(p => p.userId === actor.id) && row.participants.some(p => p.userId === otherUserId));
    if (existing) return { id: existing.id, reused: true };

    const row = await this.prisma.chatConversation.create({
      data: {
        type: ChatConversationType.DIRECT,
        createdById: actor.id,
        participants: {
          create: [
            { userId: actor.id, lastReadAt: new Date() },
            { userId: otherUserId }
          ]
        }
      }
    });
    return { id: row.id, reused: false };
  }

  async createGroup(dto: { name?: string; userIds?: string[] }, actor: RequestUser) {
    const userIds = [...new Set([actor.id, ...(dto.userIds || [])])];
    if (userIds.length < 2) throw new BadRequestException("Sélectionnez au moins un autre utilisateur.");
    const row = await this.prisma.chatConversation.create({
      data: {
        type: ChatConversationType.GROUP,
        name: dto.name?.trim() || "Groupe",
        createdById: actor.id,
        participants: { create: userIds.map(userId => ({ userId, lastReadAt: userId === actor.id ? new Date() : null })) }
      }
    });
    return { id: row.id };
  }

  async sendMessage(conversationId: string, content: string | undefined, actor: RequestUser) {
    await this.ensureParticipant(conversationId, actor.id);
    const text = content?.trim();
    if (!text) throw new BadRequestException("Message vide.");
    const message = await this.prisma.chatMessage.create({
      data: { conversationId, senderId: actor.id, content: text },
      include: { sender: { select: { id: true, username: true, fullName: true } }, conversation: { include: { participants: true } } }
    });
    await this.prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { lastReadAt: new Date() }
    });
    const recipientIds = message.conversation.participants.map(p => p.userId).filter(id => id !== actor.id);
    await this.notifications.notify(recipientIds, NotificationType.CHAT_MESSAGE, {
      title: `Nouveau message de ${actor.username}`,
      message: text.length > 120 ? `${text.slice(0, 117)}...` : text,
      entityType: "chat_conversation",
      entityId: conversationId
    });
    return message;
  }

  async markRead(conversationId: string, actor: RequestUser) {
    await this.ensureParticipant(conversationId, actor.id);
    await this.prisma.chatParticipant.update({
      where: { conversationId_userId: { conversationId, userId: actor.id } },
      data: { lastReadAt: new Date() }
    });
    return { read: true };
  }

  private async ensureParticipant(conversationId: string, userId: string) {
    const row = await this.prisma.chatParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId } } });
    if (!row) throw new ForbiddenException("Conversation non autorisée.");
    return row;
  }

  private displayName(row: Prisma.ChatConversationGetPayload<{ include: { participants: { include: { user: { select: { id: true; username: true; fullName: true } } } } } }>, actorId: string) {
    if (row.type === ChatConversationType.GROUP) return row.name || "Groupe";
    const other = row.participants.find(participant => participant.userId !== actorId)?.user;
    return other?.fullName || other?.username || "Conversation";
  }
}
