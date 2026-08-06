import { EmployeesService } from "../src/employees/employees.service";

describe("EmployeesService", () => {
  it("met à jour uniquement le matricule local et trace l'audit", async () => {
    const before = {
      id: "employee-1",
      zktecoId: "2026",
      biotimeCode: "BT-2026",
      employeeCode: "2026",
      localMatricule: null
    };
    const updated = { ...before, localMatricule: "LOC-009" };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(before),
        update: jest.fn().mockResolvedValue(updated)
      }
    };
    const audit = { record: jest.fn() };
    const service = new EmployeesService(prisma as never, audit as never);

    const result = await service.updateLocalMatricule(
      "employee-1",
      { localMatricule: " LOC-009 " },
      { id: "user-1", username: "admin", roles: ["ADMIN"], permissions: [] }
    );

    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: "employee-1" },
      data: { localMatricule: "LOC-009" }
    });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      action: "employees.update_local_matricule",
      before: expect.objectContaining({ zktecoId: "2026", employeeCode: "2026" }),
      after: expect.objectContaining({ zktecoId: "2026", employeeCode: "2026", localMatricule: "LOC-009" })
    }));
    expect(result).toBe(updated);
  });
});
