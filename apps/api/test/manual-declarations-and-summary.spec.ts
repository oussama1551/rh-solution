import { BadRequestException } from "@nestjs/common";
import { validate } from "class-validator";
import { ApprovalStatus, AttendanceSummaryStatus, ExceptionalLeaveReason, LeaveType, Prisma } from "@prisma/client";
import { CreateAbsenceReversalRequestDto, CreateOvertimeDeclarationDto } from "../src/attendance/dto/manual-declarations.dto";
import { ManualDeclarationsService } from "../src/attendance/manual-declarations.service";
import { AttendanceSummaryService } from "../src/reports/attendance-summary.service";
import { RoleCode } from "../src/roles/role-codes";

const admin = { id: "admin", username: "admin", roles: [RoleCode.Admin], permissions: [] };
const grh = { id: "grh", username: "grh", roles: [RoleCode.GRH], permissions: [] };
const manager = { id: "manager", username: "manager", roles: [RoleCode.ResponsableDepartement], permissions: [] };

function declarationsService() {
  const prisma = {
    employee: {
      findFirst: jest.fn().mockResolvedValue({ id: "emp-1" }),
      findUnique: jest.fn().mockResolvedValue({ id: "emp-1", group: { subUnit: { isSouthWilaya: false, unit: { isSouthWilaya: false } } } })
    },
    sickLeaveDeclaration: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "sick-1", ...data })), findUnique: jest.fn(), delete: jest.fn() },
    leaveDeclaration: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "leave-1", ...data, employee: { id: data.employeeId, fullName: "Employé Test" }, declaredBy: null, approvedBy: null })),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      delete: jest.fn(),
      update: jest.fn(),
      count: jest.fn().mockResolvedValue(0)
    },
    overtimeDeclaration: { create: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "ot-1", ...data })), findUnique: jest.fn(), delete: jest.fn() },
    absenceCompensation: { create: jest.fn() },
    absenceReversalRequest: {
      create: jest.fn().mockImplementation(({ data }) => Promise.resolve({
        id: "rev-1",
        ...data,
        employee: { id: data.employeeId, fullName: "Employé Test" },
        declaredBy: null,
        approvedBy: null
      })),
      findMany: jest.fn().mockResolvedValue([]),
      update: jest.fn()
    },
    attendanceSummaryRecord: { deleteMany: jest.fn(), updateMany: jest.fn() },
    annualLeaveBalance: { upsert: jest.fn().mockImplementation(({ create, update }) => Promise.resolve({ id: "bal-1", ...(create || update) })) },
    attendancePunch: { count: jest.fn() }
  };
  const audit = { record: jest.fn() };
  const notifications = { notify: jest.fn(), adminDrhUserIds: jest.fn().mockResolvedValue(["admin"]) };
  return { service: new ManualDeclarationsService(prisma as any, audit as any, notifications as any), prisma };
}

describe("ManualDeclarationsService", () => {
  it("allows GRH/Admin/DRH to declare sick leave and rejects a responsable", async () => {
    const { service, prisma } = declarationsService();
    await service.createSickLeave({ employeeId: "emp-1", dateStart: "2026-07-01", dateEnd: "2026-07-02" }, grh as any);
    expect(prisma.sickLeaveDeclaration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.APPROVED, declaredById: "grh" })
    }));

    await expect(service.createSickLeave({ employeeId: "emp-1", dateStart: "2026-07-01", dateEnd: "2026-07-02" }, manager as any))
      .rejects.toThrow(BadRequestException);
  });

  it("keeps responsable overtime pending and admin overtime approved", async () => {
    const { service, prisma } = declarationsService();
    prisma.attendancePunch.count.mockResolvedValue(2);
    await service.createOvertime({ employeeId: "emp-1", date: "2026-07-01", hours: 2.5, rateType: "RATE_50" as any }, manager as any);
    expect(prisma.overtimeDeclaration.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.PENDING_APPROVAL, approvedById: null, ratePercent: new Prisma.Decimal(50) })
    }));

    await service.createOvertime({ employeeId: "emp-1", date: "2026-07-01", hours: 2.5, rateType: "RATE_75" as any }, admin as any);
    expect(prisma.overtimeDeclaration.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.APPROVED, approvedById: "admin", ratePercent: new Prisma.Decimal(75) })
    }));
  });

  it("approves congé for GRH and keeps responsable congé pending", async () => {
    const { service, prisma } = declarationsService();

    await service.createLeave({ employeeId: "emp-1", dateStart: "2026-07-30", dateEnd: "2026-07-30" }, grh as any);
    expect(prisma.leaveDeclaration.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.APPROVED, approvedById: "grh" })
    }));

    await service.createLeave({ employeeId: "emp-1", dateStart: "2026-07-31", dateEnd: "2026-07-31" }, manager as any);
    expect(prisma.leaveDeclaration.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.PENDING_APPROVAL, approvedById: null })
    }));
  });

  it("rejects exceptional leave longer than 3 days for a responsable", async () => {
    const { service, prisma } = declarationsService();

    await expect(service.createLeave({
      employeeId: "emp-1",
      leaveType: LeaveType.EXCEPTIONNEL,
      exceptionalReason: ExceptionalLeaveReason.MARIAGE_EMPLOYE,
      dateStart: "2026-07-01",
      dateEnd: "2026-07-04"
    }, manager as any)).rejects.toThrow(BadRequestException);
    expect(prisma.leaveDeclaration.create).not.toHaveBeenCalled();
  });

  it("blocks a second Hajj for a responsable but allows admin override with note", async () => {
    const { service, prisma } = declarationsService();
    prisma.leaveDeclaration.count.mockResolvedValue(1);

    await expect(service.createLeave({
      employeeId: "emp-1",
      leaveType: LeaveType.EXCEPTIONNEL,
      exceptionalReason: ExceptionalLeaveReason.HAJJ,
      dateStart: "2026-07-01",
      dateEnd: "2026-07-03",
      note: "Nouvelle demande"
    }, manager as any)).rejects.toThrow(BadRequestException);

    await service.createLeave({
      employeeId: "emp-1",
      leaveType: LeaveType.EXCEPTIONNEL,
      exceptionalReason: ExceptionalLeaveReason.HAJJ,
      dateStart: "2026-07-01",
      dateEnd: "2026-07-03",
      note: "Dérogation direction"
    }, admin as any);
    expect(prisma.leaveDeclaration.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        leaveType: LeaveType.EXCEPTIONNEL,
        exceptionalReason: ExceptionalLeaveReason.HAJJ,
        status: ApprovalStatus.APPROVED
      })
    }));
  });

  it("recalculates annual leave balance after approving an annual leave", async () => {
    const { service, prisma } = declarationsService();
    prisma.leaveDeclaration.update.mockResolvedValue({
      id: "leave-1",
      employeeId: "emp-1",
      dateStart: new Date("2026-07-01T00:00:00.000Z"),
      dateEnd: new Date("2026-07-05T00:00:00.000Z"),
      leaveType: LeaveType.ANNUEL,
      status: ApprovalStatus.APPROVED,
      declaredById: "manager",
      employee: { id: "emp-1", fullName: "Employé Test" },
      declaredBy: null,
      approvedBy: null
    });
    prisma.leaveDeclaration.findMany.mockResolvedValue([
      { dateStart: new Date("2026-07-01T00:00:00.000Z"), dateEnd: new Date("2026-07-05T00:00:00.000Z") }
    ]);

    await service.approveLeave("leave-1", admin as any);

    expect(prisma.annualLeaveBalance.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_year: { employeeId: "emp-1", year: 2026 } },
      update: expect.objectContaining({
        daysEntitled: new Prisma.Decimal(30),
        daysTaken: new Prisma.Decimal(5),
        daysRemaining: new Prisma.Decimal(25)
      })
    }));
  });

  it("rejects overtime when the employee has no real punch on that day", async () => {
    const { service, prisma } = declarationsService();
    prisma.attendancePunch.count.mockResolvedValue(0);

    await expect(service.createOvertime({ employeeId: "emp-1", date: "2026-07-01", hours: 2, rateType: "RATE_50" as any }, manager as any))
      .rejects.toThrow(BadRequestException);
    expect(prisma.overtimeDeclaration.create).not.toHaveBeenCalled();
  });

  it("requires an overtime rate type in the DTO validation", async () => {
    const dto = Object.assign(new CreateOvertimeDeclarationDto(), {
      employeeId: "00000000-0000-0000-0000-000000000001",
      date: "2026-07-01",
      hours: 2
    });

    const errors = await validate(dto);
    expect(errors.some(error => error.property === "rateType")).toBe(true);
  });

  it("requires a reason to request an absence reversal without punch proof", async () => {
    const dto = Object.assign(new CreateAbsenceReversalRequestDto(), {
      employeeId: "00000000-0000-0000-0000-000000000001",
      absenceDate: "2026-07-30",
      reason: ""
    });

    const errors = await validate(dto);
    expect(errors.some(error => error.property === "reason")).toBe(true);

    const { service, prisma } = declarationsService();
    await expect(service.createAbsenceReversal({ employeeId: "emp-1", absenceDate: "2026-07-30", reason: " " }, manager as any))
      .rejects.toThrow(BadRequestException);
    expect(prisma.absenceReversalRequest.create).not.toHaveBeenCalled();
  });

  it("keeps responsable absence reversal pending and admin absence reversal approved", async () => {
    const { service, prisma } = declarationsService();

    await service.createAbsenceReversal({ employeeId: "emp-1", absenceDate: "2026-07-30", reason: "Attestation responsable" }, manager as any);
    expect(prisma.absenceReversalRequest.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.PENDING_APPROVAL, approvedById: null })
    }));

    await service.createAbsenceReversal({ employeeId: "emp-1", absenceDate: "2026-07-30", reason: "Correction admin" }, admin as any);
    expect(prisma.absenceReversalRequest.create).toHaveBeenLastCalledWith(expect.objectContaining({
      data: expect.objectContaining({ status: ApprovalStatus.APPROVED, approvedById: "admin" })
    }));
  });

  it("allows only admin to delete overtime declarations", async () => {
    const { service, prisma } = declarationsService();
    prisma.overtimeDeclaration.findUnique.mockResolvedValue({
      id: "ot-1",
      employeeId: "emp-1",
      employee: { id: "emp-1", fullName: "Employé Test" },
      declaredBy: null,
      approvedBy: null
    });

    await expect(service.deleteOvertime("ot-1", grh as any)).rejects.toThrow(BadRequestException);
    expect(prisma.overtimeDeclaration.delete).not.toHaveBeenCalled();

    await service.deleteOvertime("ot-1", admin as any);
    expect(prisma.overtimeDeclaration.delete).toHaveBeenCalledWith({ where: { id: "ot-1" } });
  });

  it("allows only admin to delete sick leave declarations", async () => {
    const { service, prisma } = declarationsService();
    prisma.sickLeaveDeclaration.findUnique.mockResolvedValue({
      id: "sick-1",
      employeeId: "emp-1",
      employee: { id: "emp-1", fullName: "Employé Test" },
      declaredBy: null
    });

    await expect(service.deleteSickLeave("sick-1", grh as any)).rejects.toThrow(BadRequestException);
    expect(prisma.sickLeaveDeclaration.delete).not.toHaveBeenCalled();

    await service.deleteSickLeave("sick-1", admin as any);
    expect(prisma.sickLeaveDeclaration.delete).toHaveBeenCalledWith({ where: { id: "sick-1" } });
  });
});

function summaryService(pointages: any[]) {
  const tx = { attendanceSummaryRecord: { upsert: jest.fn(), deleteMany: jest.fn() } };
  const prisma = {
    employee: { findMany: jest.fn().mockResolvedValue([{ id: "emp-1" }]) },
    overtimeDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
    absenceCompensation: { findMany: jest.fn().mockResolvedValue([]) },
    sickLeaveDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
    leaveDeclaration: { findMany: jest.fn().mockResolvedValue([]) },
    absenceReversalRequest: { findMany: jest.fn().mockResolvedValue([]) },
    attendanceSummaryRecord: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (callback: any) => callback(tx))
  };
  const reports = {
    pointagePlanning: jest.fn().mockResolvedValue(pointages),
    employeeWhere: jest.fn().mockReturnValue({})
  };
  const audit = { record: jest.fn() };
  return { service: new AttendanceSummaryService(prisma as any, reports as any, audit as any), prisma, tx, reports };
}

describe("AttendanceSummaryService", () => {
  it("does not write records when reading the report", async () => {
    const { service, prisma } = summaryService([]);
    await service.report({ startDate: "2026-07-01", endDate: "2026-07-31" }, admin as any);
    expect(prisma.attendanceSummaryRecord.findMany).toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("counts only approved overtime and marks compensation as compensated on generation", async () => {
    const { service, prisma, tx } = summaryService([{
      employee: { id: "emp-1" },
      workDate: "2026-07-10",
      workedHours: 8,
      plannedShiftType: "MORNING",
      serviceStatus: "absent"
    }]);
    prisma.overtimeDeclaration.findMany.mockResolvedValue([
      { employeeId: "emp-1", date: new Date("2026-07-10T00:00:00.000Z"), hours: new Prisma.Decimal(1), rateType: "RATE_50" },
      { employeeId: "emp-1", date: new Date("2026-07-10T00:00:00.000Z"), hours: new Prisma.Decimal(2), rateType: "RATE_75" },
      { employeeId: "emp-1", date: new Date("2026-07-10T00:00:00.000Z"), hours: new Prisma.Decimal(3), rateType: "RATE_100" }
    ]);
    prisma.absenceCompensation.findMany.mockResolvedValue([{ employeeId: "emp-1", compensationDate: new Date("2026-07-10T00:00:00.000Z") }]);

    await service.generateForPeriod({ startDate: "2026-07-01", endDate: "2026-07-31" }, admin as any);
    expect(prisma.overtimeDeclaration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: ApprovalStatus.APPROVED })
    }));
    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: AttendanceSummaryStatus.COMPENSATED,
        overtimeHours: new Prisma.Decimal(6),
        overtimeHoursRate50: new Prisma.Decimal(1),
        overtimeHoursRate75: new Prisma.Decimal(2),
        overtimeHoursRate100: new Prisma.Decimal(3),
        isCompensation: true
      })
    }));
  });

  it("forces planned REPOS days to REST even if the planning row looks absent", async () => {
    const { service, tx } = summaryService([{
      employee: { id: "emp-1" },
      workDate: "2026-07-12",
      workedHours: 0,
      plannedShiftType: "REPOS",
      serviceStatus: "absent"
    }]);

    await service.generateForPeriod({ startDate: "2026-07-01", endDate: "2026-07-31" }, admin as any);

    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: AttendanceSummaryStatus.REST
      })
    }));
  });

  it("does not convert empty planning days to absences", async () => {
    const { service, tx } = summaryService([{
      employee: { id: "emp-1" },
      workDate: "2026-07-30",
      workedHours: 0,
      plannedShiftType: null,
      serviceStatus: "empty"
    }]);

    await service.generateForPeriod({ startDate: "2026-07-26", endDate: "2026-08-25" }, admin as any);

    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: AttendanceSummaryStatus.REST,
        shiftType: null
      })
    }));
  });

  it("marks an absent planned day as congé when an approved leave covers it", async () => {
    const { service, prisma, tx } = summaryService([{
      employee: { id: "emp-1" },
      workDate: "2026-07-30",
      workedHours: 0,
      plannedShiftType: "MORNING",
      serviceStatus: "absent"
    }]);
    prisma.leaveDeclaration.findMany.mockResolvedValue([{
      employeeId: "emp-1",
      dateStart: new Date("2026-07-30T00:00:00.000Z"),
      dateEnd: new Date("2026-07-30T00:00:00.000Z")
    }]);

    await service.generateForPeriod({ startDate: "2026-07-26", endDate: "2026-08-25" }, admin as any);

    expect(prisma.leaveDeclaration.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: ApprovalStatus.APPROVED })
    }));
    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: AttendanceSummaryStatus.LEAVE
      })
    }));
  });

  it("backfills approved congé days when no pointage planning row exists", async () => {
    const { service, prisma, tx } = summaryService([]);
    prisma.leaveDeclaration.findMany.mockResolvedValue([{
      employeeId: "emp-1",
      dateStart: new Date("2026-07-30T00:00:00.000Z"),
      dateEnd: new Date("2026-07-30T00:00:00.000Z")
    }]);

    await service.generateForPeriod({ startDate: "2026-07-26", endDate: "2026-08-25" }, admin as any);

    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        employeeId_workDate_periodStart_periodEnd: expect.objectContaining({
          employeeId: "emp-1",
          workDate: new Date("2026-07-30T00:00:00.000Z")
        })
      }),
      update: expect.objectContaining({
        status: AttendanceSummaryStatus.LEAVE,
        workedHours: new Prisma.Decimal(0)
      })
    }));
  });

  it("keeps a day absent when there is no approved congé returned", async () => {
    const { service, tx } = summaryService([{
      employee: { id: "emp-1" },
      workDate: "2026-07-30",
      workedHours: 0,
      plannedShiftType: "MORNING",
      serviceStatus: "absent"
    }]);

    await service.generateForPeriod({ startDate: "2026-07-26", endDate: "2026-08-25" }, admin as any);

    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({
        status: AttendanceSummaryStatus.ABSENT
      })
    }));
  });

  it("keeps pending absence reversals absent and marks approved reversals distinctly", async () => {
    const pointage = {
      employee: { id: "emp-1" },
      workDate: "2026-07-30",
      workedHours: 0,
      plannedShiftType: "MORNING",
      serviceStatus: "absent"
    };
    const pendingCase = summaryService([pointage]);
    await pendingCase.service.generateForPeriod({ startDate: "2026-07-26", endDate: "2026-08-25" }, admin as any);
    expect(pendingCase.tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: AttendanceSummaryStatus.ABSENT })
    }));

    const approvedCase = summaryService([pointage]);
    approvedCase.prisma.absenceReversalRequest.findMany.mockResolvedValue([{
      employeeId: "emp-1",
      absenceDate: new Date("2026-07-30T00:00:00.000Z")
    }]);
    await approvedCase.service.generateForPeriod({ startDate: "2026-07-26", endDate: "2026-08-25" }, admin as any);
    expect(approvedCase.prisma.absenceReversalRequest.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ status: ApprovalStatus.APPROVED })
    }));
    expect(approvedCase.tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ status: AttendanceSummaryStatus.ABSENCE_REVERSED })
    }));
  });
  it("aggregates summary overtime by rate type for the report", async () => {
    const { service, prisma } = summaryService([]);
    const employee = {
      id: "emp-1",
      localMatricule: "100",
      biotimeCode: "100",
      employeeCode: "100",
      fullName: "Employé Test",
      department: "Production",
      group: null
    };
    prisma.attendanceSummaryRecord.findMany.mockResolvedValue([
      {
        employeeId: "emp-1",
        employee,
        status: AttendanceSummaryStatus.PRESENT,
        workedHours: new Prisma.Decimal(8),
        overtimeHours: new Prisma.Decimal(3),
        overtimeHoursRate50: new Prisma.Decimal(1),
        overtimeHoursRate75: new Prisma.Decimal(2),
        overtimeHoursRate100: new Prisma.Decimal(0),
        generatedAt: new Date("2026-07-10T00:00:00.000Z")
      },
      {
        employeeId: "emp-1",
        employee,
        status: AttendanceSummaryStatus.PRESENT,
        workedHours: new Prisma.Decimal(8),
        overtimeHours: new Prisma.Decimal(4),
        overtimeHoursRate50: new Prisma.Decimal(0),
        overtimeHoursRate75: new Prisma.Decimal(1),
        overtimeHoursRate100: new Prisma.Decimal(3),
        generatedAt: new Date("2026-07-11T00:00:00.000Z")
      }
    ]);

    const [row] = await service.report({ startDate: "2026-07-01", endDate: "2026-07-31" }, admin as any);
    expect(row.totalOvertimeHours).toBe(7);
    expect(row.overtimeHoursRate50).toBe(1);
    expect(row.overtimeHoursRate75).toBe(3);
    expect(row.overtimeHoursRate100).toBe(3);
  });

  it("writes approved overtime into summary even when pointage planning returns no row for that day", async () => {
    const { service, prisma, tx } = summaryService([]);
    prisma.overtimeDeclaration.findMany.mockResolvedValue([
      { employeeId: "emp-1", date: new Date("2026-07-15T00:00:00.000Z"), hours: new Prisma.Decimal(2), rateType: "RATE_50" }
    ]);

    await service.generateForPeriod({ startDate: "2026-06-26", endDate: "2026-07-25" }, admin as any);

    expect(tx.attendanceSummaryRecord.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        employeeId_workDate_periodStart_periodEnd: expect.objectContaining({
          employeeId: "emp-1",
          workDate: new Date("2026-07-15T00:00:00.000Z")
        })
      }),
      update: expect.objectContaining({
        overtimeHours: new Prisma.Decimal(2),
        overtimeHoursRate50: new Prisma.Decimal(2)
      })
    }));
  });

});
