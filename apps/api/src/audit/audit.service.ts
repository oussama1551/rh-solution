import { Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";

export type AuditInput = {
  userId?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  metadata?: Prisma.InputJsonValue | null;
};

export type AuditListQuery = {
  page?: number;
  limit?: number;
};

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput) {
    return this.prisma.auditLog.create({
      data: {
        userId: input.userId || null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId || null,
        ipAddress: input.ipAddress || null,
        userAgent: input.userAgent || null,
        before: input.before ?? undefined,
        after: input.after ?? undefined,
        metadata: input.metadata ?? undefined
      }
    });
  }

  async list(query: AuditListQuery = {}) {
    const page = Number.isFinite(query.page) && query.page && query.page > 0 ? query.page : 1;
    const limit = Number.isFinite(query.limit) && query.limit && query.limit > 0 ? Math.min(query.limit, 100) : 50;
    const skip = (page - 1) * limit;

    const [items, total] = await this.prisma.$transaction([
      this.prisma.auditLog.findMany({
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        include: {
          user: {
            select: {
              id: true,
              username: true,
              fullName: true
            }
          }
        }
      }),
      this.prisma.auditLog.count()
    ]);

    return { items, total, page, limit };
  }
}
