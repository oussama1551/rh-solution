import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleInit } from "@nestjs/common";
import { AttendanceBlockStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

type TimerPair = {
  start?: NodeJS.Timeout;
  end?: NodeJS.Timeout;
};

@Injectable()
export class AttendanceBlocksService implements OnModuleInit {
  private readonly logger = new Logger(AttendanceBlocksService.name);
  private readonly timers = new Map<string, TimerPair>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async onModuleInit() {
    await this.restorePersistentSchedule();
  }

  async create(input: { employeeId: string; startsAt: Date; endsAt: Date; reason: string; createdById: string }) {
    if (input.endsAt <= input.startsAt) {
      throw new BadRequestException("La fin du blocage doit être après le début.");
    }

    const employee = await this.prisma.employee.findUnique({ where: { id: input.employeeId } });

    if (!employee) {
      throw new NotFoundException("Employé introuvable.");
    }

    const now = new Date();
    const status = input.startsAt <= now && input.endsAt > now ? AttendanceBlockStatus.ACTIVE : AttendanceBlockStatus.SCHEDULED;

    const block = await this.prisma.attendanceBlock.create({
      data: {
        employeeId: input.employeeId,
        startsAt: input.startsAt,
        endsAt: input.endsAt,
        reason: input.reason,
        createdById: input.createdById,
        status,
        activatedAt: status === AttendanceBlockStatus.ACTIVE ? now : null
      }
    });

    this.scheduleBlock(block);

    await this.audit.record({
      userId: input.createdById,
      action: "attendance_blocks.create",
      entityType: "attendance_block",
      entityId: block.id,
      after: block
    });

    return block;
  }

  listActiveAndScheduled() {
    return this.prisma.attendanceBlock.findMany({
      where: {
        status: { in: [AttendanceBlockStatus.SCHEDULED, AttendanceBlockStatus.ACTIVE] }
      },
      orderBy: { startsAt: "asc" },
      include: { employee: true, createdBy: { select: { id: true, username: true, fullName: true } } }
    });
  }

  async cancel(blockId: string, userId: string) {
    const block = await this.prisma.attendanceBlock.findUnique({ where: { id: blockId } });

    if (!block) {
      throw new NotFoundException("Blocage introuvable.");
    }

    if (!this.isOpenStatus(block.status)) {
      throw new BadRequestException("Ce blocage n'est plus annulable.");
    }

    this.clearTimers(blockId);

    const updated = await this.prisma.attendanceBlock.update({
      where: { id: blockId },
      data: {
        status: AttendanceBlockStatus.CANCELLED,
        cancelledAt: new Date()
      }
    });

    await this.audit.record({
      userId,
      action: "attendance_blocks.cancel",
      entityType: "attendance_block",
      entityId: blockId,
      before: block,
      after: updated
    });

    return updated;
  }

  async isEmployeeBlocked(employeeId: string, at = new Date()) {
    const block = await this.prisma.attendanceBlock.findFirst({
      where: {
        employeeId,
        status: AttendanceBlockStatus.ACTIVE,
        startsAt: { lte: at },
        endsAt: { gt: at }
      },
      orderBy: { startsAt: "desc" }
    });

    return {
      blocked: Boolean(block),
      block
    };
  }

  async restorePersistentSchedule() {
    const now = new Date();

    await this.prisma.attendanceBlock.updateMany({
      where: {
        status: { in: [AttendanceBlockStatus.SCHEDULED, AttendanceBlockStatus.ACTIVE] },
        endsAt: { lte: now }
      },
      data: {
        status: AttendanceBlockStatus.COMPLETED,
        completedAt: now
      }
    });

    const blocks = await this.prisma.attendanceBlock.findMany({
      where: {
        status: { in: [AttendanceBlockStatus.SCHEDULED, AttendanceBlockStatus.ACTIVE] },
        endsAt: { gt: now }
      }
    });

    for (const block of blocks) {
      if (block.startsAt <= now && block.status === AttendanceBlockStatus.SCHEDULED) {
        const activated = await this.activate(block.id);

        if (activated) {
          this.scheduleBlock(activated);
        }
      } else {
        this.scheduleBlock(block);
      }
    }

    this.logger.log(`Blocages persistants rechargés: ${blocks.length}`);
  }

  private scheduleBlock(block: { id: string; startsAt: Date; endsAt: Date; status: AttendanceBlockStatus }) {
    this.clearTimers(block.id);

    if (block.status === AttendanceBlockStatus.CANCELLED || block.status === AttendanceBlockStatus.COMPLETED) {
      return;
    }

    const now = Date.now();
    const timers: TimerPair = {};

    if (block.status === AttendanceBlockStatus.SCHEDULED) {
      timers.start = setTimeout(() => void this.activate(block.id), Math.max(0, block.startsAt.getTime() - now));
    }

    timers.end = setTimeout(() => void this.complete(block.id), Math.max(0, block.endsAt.getTime() - now));
    this.timers.set(block.id, timers);
  }

  private clearTimers(blockId: string) {
    const timers = this.timers.get(blockId);

    if (timers?.start) {
      clearTimeout(timers.start);
    }

    if (timers?.end) {
      clearTimeout(timers.end);
    }

    this.timers.delete(blockId);
  }

  private async activate(blockId: string) {
    const block = await this.prisma.attendanceBlock.findUnique({ where: { id: blockId } });

    if (!block || block.status !== AttendanceBlockStatus.SCHEDULED) {
      return block;
    }

    // Statut applicatif dédié: on ne modifie jamais le champ démission ni ZKTeco.
    return this.prisma.attendanceBlock.update({
      where: { id: blockId },
      data: {
        status: AttendanceBlockStatus.ACTIVE,
        activatedAt: new Date()
      }
    });
  }

  private async complete(blockId: string) {
    const block = await this.prisma.attendanceBlock.findUnique({ where: { id: blockId } });

    if (!block || !this.isOpenStatus(block.status)) {
      return block;
    }

    this.clearTimers(blockId);

    return this.prisma.attendanceBlock.update({
      where: { id: blockId },
      data: {
        status: AttendanceBlockStatus.COMPLETED,
        completedAt: new Date()
      }
    });
  }

  private isOpenStatus(status: AttendanceBlockStatus): boolean {
    return status === AttendanceBlockStatus.SCHEDULED || status === AttendanceBlockStatus.ACTIVE;
  }
}
