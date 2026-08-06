import { AttendanceFlagStatus, AttendanceFlagType, PunchShiftStatus } from "@prisma/client";
import { AttendanceFlagsService } from "../src/attendance/attendance-flags.service";

describe("AttendanceFlagsService", () => {
  const reviewerId = "00000000-0000-0000-0000-000000000001";
  const flag = {
    id: "10000000-0000-0000-0000-000000000001",
    punchId: "20000000-0000-0000-0000-000000000001",
    type: AttendanceFlagType.OUT_OF_WINDOW,
    status: AttendanceFlagStatus.PENDING,
    reason: "Pointage hors-créneau",
    reviewNote: null,
    reviewedById: null,
    reviewedAt: null,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  function makeService() {
    const tx = {
      attendancePunch: {
        update: jest.fn()
      },
      attendanceFlag: {
        update: jest.fn()
      }
    };

    const prisma = {
      attendanceFlag: {
        findUnique: jest.fn().mockResolvedValue(flag)
      },
      $transaction: jest.fn(async callback => callback(tx))
    };

    const audit = {
      record: jest.fn()
    };

    return {
      service: new AttendanceFlagsService(prisma as never, audit as never),
      prisma,
      tx,
      audit
    };
  }

  it("valide un pointage hors-créneau et le compte comme présence normale", async () => {
    const { service, tx, audit } = makeService();
    const updated = { ...flag, status: AttendanceFlagStatus.VALIDATED };
    tx.attendanceFlag.update.mockResolvedValue(updated);

    const result = await service.validate(flag.id, reviewerId);

    expect(tx.attendancePunch.update).toHaveBeenCalledWith({
      where: { id: flag.punchId },
      data: { countsAsPresence: true }
    });
    expect(tx.attendanceFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: flag.id },
        data: expect.objectContaining({
          status: AttendanceFlagStatus.VALIDATED,
          reviewedById: reviewerId
        })
      })
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "attendance_flags.validate" }));
    expect(result).toBe(updated);
  });

  it("rejette un pointage hors-créneau et l'exclut de la présence", async () => {
    const { service, tx, audit } = makeService();
    const updated = { ...flag, status: AttendanceFlagStatus.REJECTED, reviewNote: "Sortie non autorisée" };
    tx.attendanceFlag.update.mockResolvedValue(updated);

    const result = await service.reject(flag.id, reviewerId, "Sortie non autorisée");

    expect(tx.attendancePunch.update).toHaveBeenCalledWith({
      where: { id: flag.punchId },
      data: { countsAsPresence: false }
    });
    expect(tx.attendanceFlag.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: AttendanceFlagStatus.REJECTED,
          reviewNote: "Sortie non autorisée"
        })
      })
    );
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "attendance_flags.reject" }));
    expect(result).toBe(updated);
  });

  it("crée automatiquement un flag pour un pointage OUT_OF_WINDOW", async () => {
    const punch = { id: flag.punchId, shiftStatus: PunchShiftStatus.OUT_OF_WINDOW };
    const prisma = {
      attendancePunch: {
        findUnique: jest.fn().mockResolvedValue(punch),
        update: jest.fn().mockResolvedValue({ ...punch, countsAsPresence: false })
      },
      attendanceFlag: {
        upsert: jest.fn().mockResolvedValue(flag)
      },
      $transaction: jest.fn(async operations => Promise.all(operations))
    };
    const service = new AttendanceFlagsService(prisma as never, { record: jest.fn() } as never);

    const result = await service.flagOutOfWindowPunch(flag.punchId);

    expect(prisma.attendanceFlag.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { punchId_type: { punchId: flag.punchId, type: AttendanceFlagType.OUT_OF_WINDOW } }
      })
    );
    expect(prisma.attendancePunch.update).toHaveBeenCalledWith({
      where: { id: flag.punchId },
      data: { countsAsPresence: false }
    });
    expect(result).toBe(flag);
  });
});
