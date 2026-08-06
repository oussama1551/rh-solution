import { ShiftPlanningService } from "../src/attendance/shift-planning.service";

const adminUser = { id: "admin-1", username: "admin", roles: ["ADMIN"], permissions: [] };
const supervisorUser = { id: "sup-1", username: "sup", roles: ["SUPERVISOR"], permissions: [] };
const notifications = { notify: jest.fn(), adminDrhUserIds: jest.fn().mockResolvedValue(["admin"]) };

describe("ShiftPlanningService", () => {
  it("resout les membres du groupe au moment de l'affectation de masse", async () => {
    const prisma = {
      shiftDefinition: {
        findUnique: jest.fn().mockResolvedValue({ id: "shift-night", shiftType: "NIGHT" })
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: "employee-1" }, { id: "employee-2" }])
      },
      employeeShiftAssignment: {
        upsert: jest.fn().mockResolvedValue({})
      }
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ShiftPlanningService(prisma as never, audit as never, notifications as never);

    const result = await service.assign({
      groupId: "group-1",
      shiftType: "NIGHT",
      from: "2026-07-20",
      to: "2026-07-21",
      includeWeekends: true
    }, adminUser);

    expect(prisma.employee.findMany).toHaveBeenCalledWith({ where: { groupId: "group-1" }, select: { id: true } });
    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledTimes(4);
    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        employeeId: "employee-1",
        shiftDefinitionId: "shift-night",
        assignedVia: "group",
        sourceGroupId: "group-1",
        createdById: "admin-1"
      })
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "shift_assignments.bulk_upsert",
      metadata: expect.objectContaining({
        employeeCount: 2,
        assignmentCount: 4,
        resolvedEmployeeIds: ["employee-1", "employee-2"]
      })
    }));
    expect(result).toEqual(expect.objectContaining({ employeeCount: 2, assignmentCount: 4 }));
  });

  it("enregistre un batch individuel avec un jour repos et un jour efface", async () => {
    const prisma: any = {
      shiftDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "shift-repos", shiftType: "REPOS" }])
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: "employee-1" }])
      },
      employeeShiftAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma))
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ShiftPlanningService(prisma as never, audit as never, notifications as never);

    const result = await service.batchAssign({
      employeeId: "employee-1",
      entries: [
        { date: "2026-07-20", shiftType: "REPOS" },
        { date: "2026-07-21", shiftType: null }
      ]
    }, adminUser);

    expect(prisma.employee.findMany).toHaveBeenCalledWith({ where: { id: "employee-1" }, select: { id: true } });
    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        employeeId: "employee-1",
        shiftDefinitionId: "shift-repos",
        assignedVia: "individual",
        sourceGroupId: null
      })
    }));
    expect(prisma.employeeShiftAssignment.deleteMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        employeeId: "employee-1",
        status: { in: ["APPROVED", "PENDING_APPROVAL"] }
      })
    }));
    expect(result).toEqual(expect.objectContaining({
      employeeCount: 1,
      dayCount: 2,
      upsertedCount: 1,
      removedCount: 1,
      assignmentCount: 1,
      status: "APPROVED"
    }));
  });

  it("enregistre un batch groupe en resolvant les membres actuels", async () => {
    const prisma: any = {
      shiftDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "shift-morning", shiftType: "MORNING" }])
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: "employee-1" }, { id: "employee-2" }])
      },
      employeeShiftAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma))
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ShiftPlanningService(prisma as never, audit as never, notifications as never);

    const result = await service.batchAssign({
      groupId: "group-1",
      entries: [{ date: "2026-07-20", shiftType: "MORNING" }]
    }, adminUser);

    expect(prisma.employee.findMany).toHaveBeenCalledWith({ where: { groupId: "group-1" }, select: { id: true } });
    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledTimes(2);
    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        assignedVia: "group",
        sourceGroupId: "group-1",
        createdById: "admin-1"
      })
    }));
    expect(result).toEqual(expect.objectContaining({ employeeCount: 2, dayCount: 1, assignmentCount: 2, status: "APPROVED" }));
  });

  it("affiche le planning groupe meme si un nouveau membre n'a pas encore de ligne", async () => {
    const assignmentDate = new Date("2026-07-26T00:00:00.000Z");
    const prisma: any = {
      shiftDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "shift-morning", shiftType: "MORNING", label: "Matin" }])
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: "employee-1" }, { id: "employee-2" }])
      },
      employeeShiftAssignment: {
        findMany: jest.fn()
          .mockResolvedValueOnce([{
            employeeId: "employee-1",
            date: assignmentDate,
            status: "APPROVED",
            assignedVia: "group",
            sourceGroupId: "group-1",
            shiftDefinition: { id: "shift-morning", shiftType: "MORNING", label: "Matin" },
            sourceGroup: { id: "group-1", name: "Group 1" }
          }])
          .mockResolvedValueOnce([])
      }
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ShiftPlanningService(prisma as never, audit as never, notifications as never);

    const result = await service.planningState({ groupId: "group-1", period: "2026-08" }, adminUser);

    expect(result.days.find(day => day.date === "2026-07-26")).toEqual(expect.objectContaining({
      shiftType: "MORNING",
      label: "Matin",
      state: "assigned",
      assignedVia: "group",
      sourceGroupId: "group-1"
    }));
  });

  it("met les soumissions superviseur en attente au lieu de les approuver", async () => {
    const prisma: any = {
      group: {
        findUnique: jest.fn().mockResolvedValue({ id: "group-1", createdById: "sup-1", subUnitId: "sub-unit-1" })
      },
      userSubUnitAccess: {
        findUnique: jest.fn().mockResolvedValue({ userId: "sup-1" })
      },
      shiftDefinition: {
        findMany: jest.fn().mockResolvedValue([{ id: "shift-night", shiftType: "NIGHT" }])
      },
      employee: {
        findMany: jest.fn().mockResolvedValue([{ id: "employee-1" }])
      },
      employeeShiftAssignment: {
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma))
    };
    const audit = { record: jest.fn().mockResolvedValue({}) };
    const service = new ShiftPlanningService(prisma as never, audit as never, notifications as never);

    const result = await service.batchAssign({
      groupId: "group-1",
      entries: [{ date: "2026-07-20", shiftType: "NIGHT" }]
    }, supervisorUser);

    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      create: expect.objectContaining({
        status: "PENDING_APPROVAL",
        submittedById: "sup-1",
        reviewedById: null
      })
    }));
    expect(result).toEqual(expect.objectContaining({ status: "PENDING_APPROVAL" }));
  });
});
