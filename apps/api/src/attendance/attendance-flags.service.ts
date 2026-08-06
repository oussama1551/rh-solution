import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { AttendanceFlagStatus, AttendanceFlagType, PunchShiftStatus } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class AttendanceFlagsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService
  ) {}

  async flagOutOfWindowPunch(punchId: string, reason = "Pointage hors-créneau selon le shift assigné") {
    const punch = await this.prisma.attendancePunch.findUnique({ where: { id: punchId } });

    if (!punch) {
      throw new NotFoundException("Pointage introuvable.");
    }

    if (punch.shiftStatus !== PunchShiftStatus.OUT_OF_WINDOW) {
      throw new BadRequestException("Seuls les pointages hors-créneau peuvent être signalés pour validation RH.");
    }

    const [flag] = await this.prisma.$transaction([
      this.prisma.attendanceFlag.upsert({
        where: {
          punchId_type: {
            punchId,
            type: AttendanceFlagType.OUT_OF_WINDOW
          }
        },
        update: {
          status: AttendanceFlagStatus.PENDING,
          reason,
          reviewNote: null,
          reviewedById: null,
          reviewedAt: null
        },
        create: {
          punchId,
          type: AttendanceFlagType.OUT_OF_WINDOW,
          status: AttendanceFlagStatus.PENDING,
          reason
        }
      }),
      this.prisma.attendancePunch.update({
        where: { id: punchId },
        data: { countsAsPresence: false }
      })
    ]);

    return flag;
  }

  listPending() {
    return this.prisma.attendanceFlag.findMany({
      where: {
        type: AttendanceFlagType.OUT_OF_WINDOW,
        status: AttendanceFlagStatus.PENDING
      },
      orderBy: { createdAt: "asc" },
      include: {
        punch: {
          include: {
            employee: true,
            shift: true
          }
        }
      }
    });
  }

  async validate(flagId: string, reviewerId: string) {
    const flag = await this.findPending(flagId);

    const updated = await this.prisma.$transaction(async tx => {
      await tx.attendancePunch.update({
        where: { id: flag.punchId },
        data: { countsAsPresence: true }
      });

      return tx.attendanceFlag.update({
        where: { id: flagId },
        data: {
          status: AttendanceFlagStatus.VALIDATED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNote: "Validé par RH: compter comme présence normale."
        },
        include: {
          punch: {
            include: {
              employee: true,
              shift: true
            }
          }
        }
      });
    });

    await this.audit.record({
      userId: reviewerId,
      action: "attendance_flags.validate",
      entityType: "attendance_flag",
      entityId: flagId,
      before: flag,
      after: updated,
      metadata: { punchId: flag.punchId }
    });

    return updated;
  }

  async reject(flagId: string, reviewerId: string, reason: string) {
    const flag = await this.findPending(flagId);

    const updated = await this.prisma.$transaction(async tx => {
      await tx.attendancePunch.update({
        where: { id: flag.punchId },
        data: { countsAsPresence: false }
      });

      return tx.attendanceFlag.update({
        where: { id: flagId },
        data: {
          status: AttendanceFlagStatus.REJECTED,
          reviewedById: reviewerId,
          reviewedAt: new Date(),
          reviewNote: reason
        },
        include: {
          punch: {
            include: {
              employee: true,
              shift: true
            }
          }
        }
      });
    });

    await this.audit.record({
      userId: reviewerId,
      action: "attendance_flags.reject",
      entityType: "attendance_flag",
      entityId: flagId,
      before: flag,
      after: updated,
      metadata: { punchId: flag.punchId, reason }
    });

    return updated;
  }

  private async findPending(flagId: string) {
    const flag = await this.prisma.attendanceFlag.findUnique({ where: { id: flagId } });

    if (!flag) {
      throw new NotFoundException("Signalement de pointage introuvable.");
    }

    if (flag.status !== AttendanceFlagStatus.PENDING) {
      throw new BadRequestException("Ce signalement a déjà été traité.");
    }

    return flag;
  }
}
