import { AttendanceBlockStatus } from "@prisma/client";
import { AttendanceBlocksService } from "../src/attendance/attendance-blocks.service";

describe("AttendanceBlocksService", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date("2026-07-20T10:00:00.000Z"));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it("recharge au redémarrage un blocage en cours stocké en base et l'active", async () => {
    const block = {
      id: "30000000-0000-0000-0000-000000000001",
      employeeId: "40000000-0000-0000-0000-000000000001",
      startsAt: new Date("2026-07-20T09:00:00.000Z"),
      endsAt: new Date("2026-07-20T11:00:00.000Z"),
      status: AttendanceBlockStatus.SCHEDULED,
      reason: "Suspension temporaire",
      createdById: null,
      activatedAt: null,
      completedAt: null,
      cancelledAt: null,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    const activated = { ...block, status: AttendanceBlockStatus.ACTIVE, activatedAt: new Date() };
    const prisma = {
      attendanceBlock: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        findMany: jest.fn().mockResolvedValue([block]),
        findUnique: jest.fn().mockResolvedValue(block),
        update: jest.fn().mockResolvedValue(activated)
      }
    };

    const service = new AttendanceBlocksService(prisma as never, { record: jest.fn() } as never);
    const setTimeoutSpy = jest.spyOn(global, "setTimeout");

    await service.restorePersistentSchedule();

    expect(prisma.attendanceBlock.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          endsAt: { lte: new Date("2026-07-20T10:00:00.000Z") }
        })
      })
    );
    expect(prisma.attendanceBlock.update).toHaveBeenCalledWith({
      where: { id: block.id },
      data: expect.objectContaining({
        status: AttendanceBlockStatus.ACTIVE
      })
    });
    expect(setTimeoutSpy).toHaveBeenCalled();
  });
});
