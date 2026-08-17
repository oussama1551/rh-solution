import { ForbiddenException } from "@nestjs/common";
import { PresumedAbsenceCaseType, PresumedAbsenceStatus } from "@prisma/client";
import { PresumedAbsenceService } from "../src/attendance/presumed-absence.service";
import { RoleCode } from "../src/roles/role-codes";

const admin = { id: "admin", username: "admin", roles: [RoleCode.Admin], permissions: [] };
const manager = { id: "manager", username: "manager", roles: [RoleCode.ResponsableDepartement], permissions: [] };

function makeService() {
  const prisma = {
    employee: {
      findMany: jest.fn()
    },
    attendancePunch: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([])
    },
    employeeShiftAssignment: {
      findMany: jest.fn().mockResolvedValue([])
    },
    sickLeaveDeclaration: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    },
    leaveDeclaration: {
      findMany: jest.fn().mockResolvedValue([]),
      count: jest.fn().mockResolvedValue(0)
    },
    attendanceSummaryRecord: {
      count: jest.fn().mockResolvedValue(0)
    },
    presumedAbsence: {
      upsert: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      findUnique: jest.fn(),
      update: jest.fn()
    }
  };
  const audit = { record: jest.fn() };
  const reports = {
    dailyAbsences: jest.fn().mockResolvedValue({ rows: [] })
  };
  return { service: new PresumedAbsenceService(prisma as never, audit as never, reports as never), prisma, audit, reports };
}

describe("PresumedAbsenceService", () => {
  it("ne lance aucune détection le vendredi", async () => {
    const { service, prisma, reports } = makeService();

    const result = await service.detectForToday(new Date(2026, 7, 7, 9, 0));

    expect(result).toEqual({
      skipped: false,
      heuristicSkippedReason: "friday",
      checked: 0,
      created: 0,
      plannedChecked: 0,
      plannedCreated: 0,
      heuristicChecked: 0,
      heuristicCreated: 0,
      unexpectedPresenceChecked: 0,
      unexpectedPresenceCreated: 0
    });
    expect(reports.dailyAbsences).toHaveBeenCalledWith({ date: "2026-08-07" });
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
    expect(prisma.presumedAbsence.upsert).not.toHaveBeenCalled();
  });

  it("cherche uniquement les employés actifs sans planning le jour courant", async () => {
    const { service, prisma } = makeService();
    const reference = new Date(2026, 7, 10, 9, 0);
    prisma.employee.findMany.mockResolvedValue([]);

    await service.detectForToday(reference);

    expect(prisma.employee.findMany).toHaveBeenCalledWith({
      where: {
        status: "ACTIVE",
        plannedShiftAssignments: {
          none: {
            date: new Date(Date.UTC(2026, 7, 10))
          }
        }
      },
      select: { id: true, employeeCode: true, biotimeCode: true, localMatricule: true }
    });
    expect(prisma.presumedAbsence.upsert).not.toHaveBeenCalled();
  });

  it("ne détecte pas un employé sans planning s'il a un pointage ce matin", async () => {
    const { service, prisma } = makeService();
    prisma.employee.findMany.mockResolvedValue([{ id: "employee-1" }]);
    prisma.attendancePunch.count.mockResolvedValue(1);

    const result = await service.detectForToday(new Date(2026, 7, 10, 9, 0));

    expect(result).toEqual({
      skipped: false,
      checked: 1,
      created: 0,
      plannedChecked: 0,
      plannedCreated: 0,
      heuristicChecked: 1,
      heuristicCreated: 0,
      unexpectedPresenceChecked: 0,
      unexpectedPresenceCreated: 0
    });
    expect(prisma.presumedAbsence.upsert).not.toHaveBeenCalled();
  });

  it("ne détecte pas une fiche doublon si le même matricule affiché a des pointages", async () => {
    const { service, prisma } = makeService();
    prisma.employee.findMany.mockResolvedValue([{ id: "shadow-employee", employeeCode: "133", biotimeCode: "", localMatricule: "RECYCLAGE_DEV-702" }]);
    prisma.attendancePunch.count.mockResolvedValue(2);

    const result = await service.detectForToday(new Date(2026, 7, 10, 9, 0));

    expect(result.created).toBe(0);
    expect(prisma.attendancePunch.count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        OR: expect.arrayContaining([
          { employeeId: "shadow-employee" },
          { employee: { localMatricule: "RECYCLAGE_DEV-702" } }
        ])
      })
    }));
    expect(prisma.presumedAbsence.upsert).not.toHaveBeenCalled();
  });

  it("crée une absence présumée manquante quand aucun pointage n'existe hier ni ce matin", async () => {
    const { service, prisma } = makeService();
    const reference = new Date(2026, 7, 10, 9, 0);
    prisma.employee.findMany.mockResolvedValue([{ id: "employee-1" }]);
    prisma.attendancePunch.count.mockResolvedValue(0);
    prisma.presumedAbsence.upsert.mockResolvedValue({
      id: "presumed-1",
      employeeId: "employee-1",
      date: new Date(2026, 7, 10),
      detectedAt: reference,
      basis: "no_punch_heuristic",
      status: PresumedAbsenceStatus.PENDING_REVIEW
    });

    const result = await service.detectForToday(reference);

    expect(result).toEqual({
      skipped: false,
      checked: 1,
      created: 1,
      plannedChecked: 0,
      plannedCreated: 0,
      heuristicChecked: 1,
      heuristicCreated: 1,
      unexpectedPresenceChecked: 0,
      unexpectedPresenceCreated: 0
    });
    expect(prisma.presumedAbsence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_date_caseType: { employeeId: "employee-1", date: new Date(Date.UTC(2026, 7, 10)), caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE } },
      create: expect.objectContaining({
        employeeId: "employee-1",
        basis: "no_punch_heuristic",
        status: PresumedAbsenceStatus.PENDING_REVIEW
      })
    }));
  });

  it("importe les absences du module Absences du jour dans la liste de confirmation", async () => {
    const { service, prisma, reports } = makeService();
    const reference = new Date(2026, 7, 10, 9, 0);
    reports.dailyAbsences.mockResolvedValue({
      rows: [
        { status: "ABSENT", date: "2026-08-10", employee: { id: "planned-absent" } },
        { status: "NOT_DUE", date: "2026-08-10", employee: { id: "not-due" } }
      ]
    });
    prisma.employee.findMany.mockResolvedValue([]);
    prisma.presumedAbsence.upsert.mockResolvedValue({
      id: "presumed-planned",
      employeeId: "planned-absent",
      date: new Date(2026, 7, 10),
      detectedAt: reference,
      basis: "daily_absence_report",
      status: PresumedAbsenceStatus.PENDING_REVIEW
    });

    const result = await service.detectForToday(reference);

    expect(result).toEqual({
      skipped: false,
      checked: 1,
      created: 1,
      plannedChecked: 1,
      plannedCreated: 1,
      heuristicChecked: 0,
      heuristicCreated: 0,
      unexpectedPresenceChecked: 0,
      unexpectedPresenceCreated: 0
    });
    expect(prisma.presumedAbsence.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_date_caseType: { employeeId: "planned-absent", date: new Date(Date.UTC(2026, 7, 10)), caseType: PresumedAbsenceCaseType.PRESUMED_ABSENCE } },
      create: expect.objectContaining({
        employeeId: "planned-absent",
        basis: "daily_absence_report",
        status: PresumedAbsenceStatus.PENDING_REVIEW
      })
    }));
  });

  it("utilise la date demandée par l'écran et ignore l'heuristique sans planning hors aujourd'hui", async () => {
    const { service, prisma, reports } = makeService();
    const reference = new Date(2026, 7, 10, 9, 0);
    reports.dailyAbsences.mockResolvedValue({
      rows: [
        { status: "ABSENT", date: "2026-08-03", employee: { id: "planned-absent" } }
      ]
    });
    prisma.presumedAbsence.upsert.mockResolvedValue({
      id: "presumed-planned",
      employeeId: "planned-absent",
      date: new Date(2026, 7, 3),
      detectedAt: reference,
      basis: "daily_absence_report",
      status: PresumedAbsenceStatus.PENDING_REVIEW
    });

    const result = await service.detectForToday(reference, "2026-08-03");

    expect(reports.dailyAbsences).toHaveBeenCalledWith({ date: "2026-08-03" });
    expect(prisma.employee.findMany).not.toHaveBeenCalled();
    expect(result).toEqual({
      skipped: false,
      heuristicSkippedReason: "not_today",
      checked: 1,
      created: 1,
      plannedChecked: 1,
      plannedCreated: 1,
      heuristicChecked: 0,
      heuristicCreated: 0,
      unexpectedPresenceChecked: 0,
      unexpectedPresenceCreated: 0
    });
  });

  it("refuse la confirmation par un responsable département", async () => {
    const { service } = makeService();

    await expect(service.confirm("presumed-1", manager)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("confirme une absence présumée pour Admin, DRH ou GRH", async () => {
    const { service, prisma, audit } = makeService();
    prisma.presumedAbsence.findUnique.mockResolvedValue({ id: "presumed-1", status: PresumedAbsenceStatus.PENDING_REVIEW });
    prisma.presumedAbsence.update.mockResolvedValue({
      id: "presumed-1",
      status: PresumedAbsenceStatus.CONFIRMED,
      employee: { id: "employee-1", fullName: "Employé Test" },
      reviewedBy: { id: "admin", username: "admin", fullName: null }
    });

    const result = await service.confirm("presumed-1", admin);

    expect(prisma.presumedAbsence.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "presumed-1" },
      data: expect.objectContaining({
        status: PresumedAbsenceStatus.CONFIRMED,
        reviewedById: "admin"
      })
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "presumed_absence.confirm" }));
    expect(result.status).toBe(PresumedAbsenceStatus.CONFIRMED);
  });

  it("rejette automatiquement les absences en attente d'un employé démissionné avant affichage", async () => {
    const { service, prisma, audit } = makeService();
    const stale = {
      id: "presumed-resigned",
      status: PresumedAbsenceStatus.PENDING_REVIEW,
      employee: { id: "emp-resigned", fullName: "ACHARI AHMED", status: "RESIGNED" }
    };
    prisma.presumedAbsence.findMany
      .mockResolvedValueOnce([stale])
      .mockResolvedValueOnce([]);
    prisma.presumedAbsence.update.mockResolvedValue({ ...stale, status: PresumedAbsenceStatus.REJECTED });

    const rows = await service.list({ status: "PENDING_REVIEW", date: "2026-08-10" }, admin);

    expect(rows).toEqual([]);
    expect(prisma.presumedAbsence.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "presumed-resigned" },
      data: expect.objectContaining({
        status: PresumedAbsenceStatus.REJECTED,
        reviewNote: "Rejet automatique: employé non actif/démissionné."
      })
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "presumed_absence.auto_reject_inactive" }));
  });
});
