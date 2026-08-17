import { PresumedAbsenceCaseType } from "@prisma/client";
import { PresumedAbsenceService } from "./presumed-absence.service";

describe("PresumedAbsenceService - présence sur repos", () => {
  const date = "2026-08-15";
  const detectedAt = new Date("2026-08-16T09:00:00+02:00");

  function setup(punches: Date[]) {
    const upsert = jest.fn().mockImplementation(({ create }) => Promise.resolve({ ...create }));
    const prisma: any = {
      employeeShiftAssignment: { findMany: jest.fn().mockResolvedValue([{ employee: { id: "employee-1", employeeCode: "E1", biotimeCode: "12", localMatricule: "702" } }]) },
      attendancePunch: { findMany: jest.fn().mockResolvedValue(punches.map(punchTime => ({ punchTime }))) },
      presumedAbsence: { upsert }
    };
    const reports: any = { dailyAbsences: jest.fn() };
    return { service: new PresumedAbsenceService(prisma, { record: jest.fn() } as any, reports), prisma, reports, upsert };
  }

  it("crée UNEXPECTED_PRESENCE_ON_REST avec l'heure du pointage", async () => {
    const { service, upsert } = setup([new Date("2026-08-15T06:45:00+02:00")]);
    const result = await service.detectUnexpectedPresenceOnRest(date, detectedAt);
    expect(result).toEqual({ checked: 1, created: 1 });
    expect(upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { employeeId_date_caseType: { employeeId: "employee-1", date: new Date("2026-08-15T00:00:00.000Z"), caseType: PresumedAbsenceCaseType.UNEXPECTED_PRESENCE_ON_REST } },
      create: expect.objectContaining({ caseType: PresumedAbsenceCaseType.UNEXPECTED_PRESENCE_ON_REST, message: expect.stringContaining("06:45") })
    }));
  });

  it("ne crée rien lorsqu'un REPOS n'a aucun pointage", async () => {
    const { service, upsert } = setup([]);
    const result = await service.detectUnexpectedPresenceOnRest(date, detectedAt);
    expect(result).toEqual({ checked: 1, created: 0 });
    expect(upsert).not.toHaveBeenCalled();
  });

  it("utilise une clé unique distincte du cas PRESUMED_ABSENCE", async () => {
    const { service, upsert } = setup([new Date("2026-08-15T08:00:00+02:00")]);
    await service.detectUnexpectedPresenceOnRest(date, detectedAt);
    const unique = upsert.mock.calls[0][0].where.employeeId_date_caseType;
    expect(unique.caseType).toBe(PresumedAbsenceCaseType.UNEXPECTED_PRESENCE_ON_REST);
    expect(unique.caseType).not.toBe(PresumedAbsenceCaseType.PRESUMED_ABSENCE);
  });
});
