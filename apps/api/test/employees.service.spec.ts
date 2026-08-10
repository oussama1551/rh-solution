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

  it("met à jour BioTime puis la copie locale après une modification employé", async () => {
    const before = {
      id: "employee-1",
      zktecoId: "2026",
      biotimeCode: "2026",
      employeeCode: "2026",
      fullName: "Ancien Nom",
      sourcePayload: { id: "2026", emp_code: "2026" }
    };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(before),
        upsert: jest.fn().mockResolvedValue({ ...before, fullName: "BELAKHDAR OUSSAMA", department: "IT" })
      }
    };
    const audit = { record: jest.fn() };
    const biotime = {
      updateEmployee: jest.fn().mockResolvedValue({
        id: "2026",
        emp_code: "2026",
        first_name: "BELAKHDAR",
        last_name: "OUSSAMA",
        department_name: "IT"
      })
    };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    const result = await service.updateInBioTime(
      "employee-1",
      { firstName: "BELAKHDAR", lastName: "OUSSAMA", department: "10" },
      { id: "admin", username: "admin", roles: ["ADMIN"], permissions: [] }
    );

    expect(biotime.updateEmployee).toHaveBeenCalledWith("2026", expect.objectContaining({
      first_name: "BELAKHDAR",
      last_name: "OUSSAMA",
      department: "10"
    }));
    expect(prisma.employee.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { zktecoId: "2026" },
      update: expect.objectContaining({ fullName: "BELAKHDAR OUSSAMA", department: "IT" })
    }));
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "employee.update" }));
    expect(result.fullName).toBe("BELAKHDAR OUSSAMA");
  });

  it("ne modifie pas la copie locale si BioTime refuse l'écriture", async () => {
    const before = {
      id: "employee-1",
      zktecoId: "2026",
      biotimeCode: "2026",
      employeeCode: "2026",
      fullName: "Ancien Nom",
      sourcePayload: { id: "2026", emp_code: "2026" }
    };
    const prisma = {
      employee: {
        findUnique: jest.fn().mockResolvedValue(before),
        upsert: jest.fn()
      }
    };
    const audit = { record: jest.fn() };
    const biotime = {
      updateEmployee: jest.fn().mockRejectedValue(new Error("BioTime 400"))
    };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    await expect(service.updateInBioTime(
      "employee-1",
      { firstName: "Nouveau" },
      { id: "admin", username: "admin", roles: ["ADMIN"], permissions: [] }
    )).rejects.toThrow("Modification BioTime refusée");

    expect(prisma.employee.upsert).not.toHaveBeenCalled();
    expect(audit.record).not.toHaveBeenCalled();
  });

  it("rejette la création si le numéro employé existe déjà avant l'appel BioTime", async () => {
    const prisma = {
      employee: {
        findFirst: jest.fn().mockResolvedValue({ id: "employee-1", employeeCode: "2026" }),
        upsert: jest.fn()
      }
    };
    const audit = { record: jest.fn() };
    const biotime = {
      createEmployee: jest.fn()
    };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    await expect(service.createInBioTime(
      { empCode: "2026", firstName: "Test", department: "10" },
      { id: "admin", username: "admin", roles: ["ADMIN"], permissions: [] }
    )).rejects.toThrow("existe déjà");

    expect(biotime.createEmployee).not.toHaveBeenCalled();
    expect(prisma.employee.upsert).not.toHaveBeenCalled();
  });

  it("restaure un employé démissionné et met à jour le statut local immédiatement", async () => {
    const employee = {
      id: "employee-1",
      zktecoId: "2026",
      employeeCode: "2026",
      status: "RESIGNED",
      resignedAt: new Date("2026-08-01"),
      sourcePayload: { id: "2026" }
    };
    const updated = { ...employee, status: "ACTIVE", resignedAt: null };
    const prisma = {
      resignRecord: {
        findUnique: jest.fn().mockResolvedValue({ id: "resign-1", biotimeId: "99", reason: "Fin contrat", employee })
      },
      employee: {
        update: jest.fn().mockResolvedValue(updated)
      }
    };
    const audit = { record: jest.fn() };
    const biotime = { reinstateResign: jest.fn().mockResolvedValue({ id: "99" }) };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    const result = await service.reinstateResign("resign-1", { id: "admin", username: "admin", roles: ["DRH"], permissions: [] });

    expect(biotime.reinstateResign).toHaveBeenCalledWith("99");
    expect(prisma.employee.update).toHaveBeenCalledWith({ where: { id: "employee-1" }, data: { status: "ACTIVE", resignedAt: null } });
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "employee.reinstate" }));
    expect("status" in result ? result.status : null).toBe("ACTIVE");
  });

  it("refuse une démission sans motif obligatoire", async () => {
    const prisma = {};
    const audit = { record: jest.fn() };
    const biotime = { createResign: jest.fn() };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    await expect(service.resignEmployee(
      "employee-1",
      { resignDate: "2026-08-01", resignType: "Démissionner", reason: " " },
      { id: "admin", username: "admin", roles: ["ADMIN"], permissions: [] }
    )).rejects.toThrow("motif");

    expect(biotime.createResign).not.toHaveBeenCalled();
  });

  it("bloque un responsable qui tente de gérer une démission", async () => {
    const prisma = {};
    const audit = { record: jest.fn() };
    const biotime = { createResign: jest.fn(), reinstateResign: jest.fn() };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    await expect(service.resignEmployee(
      "employee-1",
      { resignDate: "2026-08-01", resignType: "Démissionner", reason: "Départ confirmé" },
      { id: "resp", username: "resp", roles: ["RESPONSABLE_DEPARTEMENT"], permissions: [] }
    )).rejects.toThrow("Seuls Admin, DRH et GRH");

    expect(biotime.createResign).not.toHaveBeenCalled();
  });

  it("envoie le code BioTime correct pour le type Quitter", async () => {
    const before = {
      id: "employee-1",
      zktecoId: "2026",
      biotimeCode: "2026",
      employeeCode: "2026",
      fullName: "Employé Test",
      status: "ACTIVE",
      sourcePayload: { id: "2026", emp_code: "2026" }
    };
    const prisma: any = {};
    prisma.employee = {
      findUnique: jest.fn().mockResolvedValue(before),
      update: jest.fn().mockResolvedValue({ ...before, status: "RESIGNED" })
    };
    prisma.resignRecord = {
      upsert: jest.fn().mockResolvedValue({ id: "resign-1", biotimeId: "77" })
    };
    prisma.$transaction = jest.fn(async callback => callback(prisma));
    const audit = { record: jest.fn() };
    const biotime = {
      createResign: jest.fn().mockResolvedValue({ id: "77", employee: "2026", resign_type: 1, resign_date: "2026-08-09" })
    };
    const service = new EmployeesService(prisma as never, audit as never, biotime as never);

    await service.resignEmployee(
      "employee-1",
      { resignDate: "2026-08-09", resignType: "Quitter", reason: "Départ confirmé" },
      { id: "admin", username: "admin", roles: ["ADMIN"], permissions: [] }
    );

    expect(biotime.createResign).toHaveBeenCalledWith(expect.objectContaining({ resign_type: "1" }));
  });
});
