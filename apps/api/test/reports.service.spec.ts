import {
  AttendanceFlagStatus,
  AttendanceFlagType,
  DeviceStatus,
  EmployeeStatus,
  PunchDirection,
  PunchShiftStatus
} from "@prisma/client";
import { ReportsService } from "../src/reports/reports.service";

describe("ReportsService", () => {
  it("marks an assigned REPOS day as repos instead of absent when there is no punch", async () => {
    const prisma: any = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "emp-1",
            zktecoId: "z-1",
            biotimeCode: "BT-1",
            localMatricule: null,
            employeeCode: "E-1",
            fullName: "Employe Repos",
            department: null,
            status: "ACTIVE",
            group: null
          }
        ])
      },
      shiftDefinition: {
        findMany: jest.fn().mockResolvedValue([
          { id: "shift-repos", shiftType: "REPOS", label: "Repos", startTime: null, endTime: null, spansMidnight: false, marginMinutes: 0 }
        ])
      },
      employeeShiftAssignment: {
        findMany: jest.fn().mockResolvedValue([
          {
            employeeId: "emp-1",
            date: new Date("2026-07-20T00:00:00.000Z"),
            shiftDefinitionId: "shift-repos",
            assignedVia: "group",
            sourceGroupId: "group-1",
            sourceGroup: { id: "group-1", name: "Groupe Repos" },
            shiftDefinition: { id: "shift-repos", shiftType: "REPOS", label: "Repos" }
          }
        ])
      },
      attendancePunch: {
        findMany: jest.fn().mockResolvedValue([])
      }
    };
    const service = new ReportsService(prisma);

    const rows = await service.pointagePlanning({ startDate: "2026-07-20", endDate: "2026-07-20", status: "ACTIVE" as any });

    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual(expect.objectContaining({
      plannedShiftType: "REPOS",
      serviceStatus: "repos"
    }));
  });

  it("does not count REPOS or empty planning days as daily absences", async () => {
    const reposEmployee = {
      id: "emp-repos",
      biotimeCode: "69",
      localMatricule: "RECYCLAGE_DEV-625",
      employeeCode: "69",
      fullName: "MERNIZ ABDELKRIM",
      department: "RECY SECURITE",
      group: { name: "Merniz Abdelkarim", subUnit: { name: "FAB SEC", unit: { name: "FABCOM" } } }
    };
    const emptyEmployee = {
      id: "emp-empty",
      biotimeCode: "70",
      localMatricule: null,
      employeeCode: "70",
      fullName: "EMPLOYE SANS PLANNING",
      department: "FAB SEC",
      group: { name: "FAB SEC", subUnit: { name: "FAB SEC", unit: { name: "FABCOM" } } }
    };
    const prisma: any = {
      employee: { findMany: jest.fn().mockResolvedValue([reposEmployee, emptyEmployee]) },
      shiftDefinition: { findMany: jest.fn().mockResolvedValue([
        { id: "shift-morning", shiftType: "MORNING", label: "Matin", startTime: "06:00", endTime: "15:00", spansMidnight: false, marginMinutes: 0 },
        { id: "shift-repos", shiftType: "REPOS", label: "Repos", startTime: null, endTime: null, spansMidnight: false, marginMinutes: 0 }
      ]) },
      employeeShiftAssignment: { findMany: jest.fn().mockResolvedValue([
        {
          employeeId: "emp-repos",
          date: new Date("2026-07-30T00:00:00.000Z"),
          shiftDefinitionId: "shift-repos",
          assignedVia: "individual",
          sourceGroupId: null,
          sourceGroup: null,
          shiftDefinition: { id: "shift-repos", shiftType: "REPOS", label: "Repos", startTime: null, endTime: null, marginMinutes: 0 }
        },
        {
          employeeId: "emp-repos",
          date: new Date("2026-07-29T00:00:00.000Z"),
          shiftDefinitionId: "shift-morning",
          assignedVia: "group",
          sourceGroupId: "group-1",
          sourceGroup: { id: "group-1", name: "Merniz Abdelkarim" },
          shiftDefinition: { id: "shift-morning", shiftType: "MORNING", label: "Matin", startTime: "06:00", endTime: "15:00", marginMinutes: 0 }
        }
      ]) },
      attendancePunch: { findMany: jest.fn().mockResolvedValue([]) }
    };
    const service = new ReportsService(prisma);

    const report = await service.dailyAbsences({ date: "2026-07-30", search: "MERNIZ" });

    expect(report.totals).toEqual({ planned: 0, absent: 0, notDue: 0 });
    expect(report.rows).toEqual([]);
    expect(prisma.employeeShiftAssignment.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        date: { gte: new Date("2026-07-30T00:00:00.000Z"), lt: new Date("2026-07-31T00:00:00.000Z") }
      })
    }));
  });

  it("adds planning source and raw punches to daily absence rows for verification", async () => {
    const employee = {
      id: "emp-absence",
      biotimeCode: "128",
      localMatricule: "FABCOM_DEV-932",
      employeeCode: "128",
      fullName: "MANSOURI ABDELHAKIM",
      department: "FAB ATELIER CHARGE",
      group: { name: "Atelier charge", subUnit: { name: "FAB SEC", unit: { name: "FABCOM" } } }
    };
    const prisma: any = {
      employee: { findMany: jest.fn().mockResolvedValue([employee]) },
      shiftDefinition: { findMany: jest.fn().mockResolvedValue([
        { id: "shift-morning", shiftType: "MORNING", label: "Matin", startTime: "06:00", endTime: "15:00", spansMidnight: false, marginMinutes: 0 }
      ]) },
      employeeShiftAssignment: { findMany: jest.fn().mockResolvedValue([
        {
          employeeId: "emp-absence",
          date: new Date("2026-07-30T00:00:00.000Z"),
          shiftDefinitionId: "shift-morning",
          assignedVia: "group",
          sourceGroupId: "group-1",
          sourceGroup: { id: "group-1", name: "Equipe matin" },
          shiftDefinition: { id: "shift-morning", shiftType: "MORNING", label: "Matin", startTime: "06:00", endTime: "15:00", marginMinutes: 0 }
        }
      ]) },
      attendancePunch: { findMany: jest.fn().mockResolvedValue([
        {
          id: "punch-late-night",
          employeeId: "emp-absence",
          punchTime: new Date("2026-07-30T22:10:00.000Z"),
          direction: "CHECK_IN",
          biotimeId: "bio-1",
          zktecoPunchId: "zk-1"
        }
      ]) }
    };
    const service = new ReportsService(prisma);

    const report = await service.dailyAbsences({ date: "2026-07-30", search: "MANSOURI" });

    expect(report.rows).toHaveLength(1);
    expect(report.rows[0]).toEqual(expect.objectContaining({
      status: "ABSENT",
      planning: {
        assignedVia: "group",
        sourceGroupName: "Equipe matin",
        employeeGroupName: "Atelier charge"
      },
      punches: [{
        id: "punch-late-night",
        punchTime: new Date("2026-07-30T22:10:00.000Z"),
        direction: "CHECK_IN",
        sourceId: "bio-1"
      }]
    }));
  });
  const shift = {
    id: "shift-day",
    code: "DAY",
    name: "Jour",
    startTime: "08:00",
    endTime: "16:00",
    spansMidnight: false,
    applicableDays: ["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY"],
    toleranceBeforeMinutes: 15,
    toleranceAfterMinutes: 15,
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date()
  };

  const employee = {
    id: "employee-1",
    zktecoId: "2026",
    biotimeCode: "BT-2026",
    localMatricule: "LOC-009",
    employeeCode: "2026",
    fullName: "BELAKHDAR OUSSAMA",
    department: "IT",
    phone: null,
    hireDate: null,
    resignedAt: null,
    status: EmployeeStatus.ACTIVE,
    createdAt: new Date(),
    updatedAt: new Date(),
    shiftAssignments: [
      {
        id: "assignment-1",
        employeeId: "employee-1",
        shiftId: "shift-day",
        validFrom: new Date("2026-07-01T00:00:00.000Z"),
        validTo: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        shift
      }
    ],
    attendancePunches: [
      {
        id: "punch-in",
        employeeId: "employee-1",
        shiftId: "shift-day",
        zktecoPunchId: "zk-1",
        punchTime: new Date("2026-07-20T08:20:00.000Z"),
        direction: PunchDirection.CHECK_IN,
        shiftDate: new Date("2026-07-20T00:00:00.000Z"),
        shiftStatus: PunchShiftStatus.LATE,
        countsAsPresence: true,
        rawPayload: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        shift,
        flags: []
      },
      {
        id: "punch-out",
        employeeId: "employee-1",
        shiftId: "shift-day",
        zktecoPunchId: "zk-2",
        punchTime: new Date("2026-07-20T17:00:00.000Z"),
        direction: PunchDirection.CHECK_OUT,
        shiftDate: new Date("2026-07-20T00:00:00.000Z"),
        shiftStatus: PunchShiftStatus.LATE,
        countsAsPresence: true,
        rawPayload: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        shift,
        flags: []
      },
      {
        id: "punch-flag",
        employeeId: "employee-1",
        shiftId: "shift-day",
        zktecoPunchId: "zk-3",
        punchTime: new Date("2026-07-21T12:00:00.000Z"),
        direction: PunchDirection.CHECK_IN,
        shiftDate: new Date("2026-07-21T00:00:00.000Z"),
        shiftStatus: PunchShiftStatus.OUT_OF_WINDOW,
        countsAsPresence: false,
        rawPayload: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        shift,
        flags: [
          {
            id: "flag-1",
            punchId: "punch-flag",
            type: AttendanceFlagType.OUT_OF_WINDOW,
            status: AttendanceFlagStatus.REJECTED,
            reason: "Hors-créneau",
            reviewNote: "Rejet RH",
            reviewedById: null,
            reviewedAt: null,
            createdAt: new Date(),
            updatedAt: new Date()
          }
        ]
      }
    ]
  };

  function makeService() {
    const prisma = {
      employee: {
        findMany: jest.fn().mockResolvedValue([employee]),
        count: jest.fn().mockResolvedValue(1)
      },
      shiftDefinition: {
        findMany: jest.fn().mockResolvedValue([{
          id: "def-day",
          shiftType: "MORNING",
          label: "Matin",
          startTime: "08:00",
          endTime: "16:00",
          spansMidnight: false,
          marginMinutes: 15
        }])
      },
      employeeShiftAssignment: {
        findMany: jest.fn().mockResolvedValue([])
      },
      attendancePunch: {
        findMany: jest.fn().mockResolvedValue([])
      },
      attendanceFlag: {
        count: jest.fn().mockResolvedValue(2)
      },
      device: {
        count: jest.fn().mockResolvedValue(1)
      },
      group: {
        count: jest.fn().mockResolvedValue(0)
      }
    };

    return {
      service: new ReportsService(prisma as never),
      prisma
    };
  }

  it("calcule le rapport mensuel par employé avec absences, retards, heures sup et flags", async () => {
    const { service } = makeService();

    const [report] = await service.monthlyByEmployee({
      startDate: "2026-07-20",
      endDate: "2026-07-21",
      status: EmployeeStatus.ACTIVE
    });

    expect(report.expectedDays).toBe(2);
    expect(report.presentDays).toBe(1);
    expect(report.absentDays).toBe(1);
    expect(report.lateCount).toBe(1);
    expect(report.lateMinutes).toBe(20);
    expect(report.overtimeMinutes).toBe(40);
    expect(report.outOfWindow.rejected).toBe(1);
    expect(report.employee.code).toBe("LOC-009");
    expect(report.employee.sourceCode).toBe("BT-2026");
  });

  it("agrège le rapport global par département", async () => {
    const { service } = makeService();

    const [row] = await service.departmentSummary({
      startDate: "2026-07-20",
      endDate: "2026-07-21"
    });

    expect(row.department).toBe("IT");
    expect(row.employeeCount).toBe(1);
    expect(row.presenceRate).toBe(50);
    expect(row.outOfWindowRejected).toBe(1);
  });

  it("calcule les KPIs dashboard depuis les vraies tables", async () => {
    jest.useFakeTimers().setSystemTime(new Date("2026-07-21T12:00:00.000Z"));
    const { service, prisma } = makeService();

    const kpis = await service.dashboardKpis();

    expect(kpis.presenceRate).toBe(6.67);
    expect(kpis.lateCountThisMonth).toBe(1);
    expect(kpis.pendingAttendanceFlags).toBe(2);
    expect(kpis.offlineDevices).toBe(1);
    expect(prisma.device.count).toHaveBeenCalledWith({ where: { status: DeviceStatus.OFFLINE } });
    jest.useRealTimers();
  });
});
