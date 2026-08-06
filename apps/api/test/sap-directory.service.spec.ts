import { SapDirectoryService } from "../src/sap/sap-directory.service";

describe("SapDirectoryService", () => {
  it("links a SAP row to a unique BioTime employee by exact name when SAP has no BioTime id", async () => {
    const prisma: any = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: "employee-1",
            zktecoId: "1900",
            biotimeCode: "",
            employeeCode: "5240",
            localMatricule: null,
            fullName: "SOUALMIA AKRAM",
            phone: null
          }
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 })
      },
      sapEmployeeDirectory: {
        upsert: jest.fn().mockResolvedValue({})
      }
    };
    const cache: any = {
      refresh: jest.fn().mockResolvedValue([
        {
          empID: "NEWTECH_DEV-1190",
          biotimeId: null,
          company: "NEWTECH",
          Nom: "SOUALMIA",
          Prenom: "AKRAM",
          sapFullName: "SOUALMIA AKRAM",
          normalizedName: "akram soualmia",
          normalizedPhone: "",
          Poste: "Cadre charge des achats",
          Structure: "Direction Generale",
          Date_Entrer: null,
          mobile: "0659452310"
        }
      ]),
      status: jest.fn().mockReturnValue({ loaded: true, employeeCount: 1 })
    };
    const service = new SapDirectoryService(prisma, cache, {} as any);

    const result = await service.refresh();

    expect(prisma.sapEmployeeDirectory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { sapEmpId: "NEWTECH_DEV-1190" },
      update: expect.objectContaining({
        employeeId: "employee-1",
        biotimeId: null
      })
    }));
    expect(prisma.employee.updateMany).toHaveBeenCalledWith({
      where: {
        id: "employee-1",
        OR: [{ localMatricule: null }, { localMatricule: "" }]
      },
      data: { localMatricule: "NEWTECH_DEV-1190" }
    });
    expect(result).toEqual(expect.objectContaining({
      linked: 1,
      autoNameLinked: 1,
      localMatriculesUpdated: 1
    }));
  });

  it("does not auto-link when the name match is ambiguous", async () => {
    const prisma: any = {
      employee: {
        findMany: jest.fn().mockResolvedValue([
          { id: "employee-1", zktecoId: "1", biotimeCode: "", employeeCode: "5240", localMatricule: null, fullName: "SOUALMIA AKRAM", phone: null },
          { id: "employee-2", zktecoId: "2", biotimeCode: "", employeeCode: "5241", localMatricule: null, fullName: "AKRAM SOUALMIA", phone: null }
        ]),
        updateMany: jest.fn()
      },
      sapEmployeeDirectory: {
        upsert: jest.fn().mockResolvedValue({})
      }
    };
    const cache: any = {
      refresh: jest.fn().mockResolvedValue([
        {
          empID: "NEWTECH_DEV-1190",
          biotimeId: null,
          company: "NEWTECH",
          Nom: "SOUALMIA",
          Prenom: "AKRAM",
          sapFullName: "SOUALMIA AKRAM",
          normalizedName: "akram soualmia",
          normalizedPhone: "",
          Poste: null,
          Structure: null,
          Date_Entrer: null,
          mobile: null
        }
      ]),
      status: jest.fn().mockReturnValue({ loaded: true, employeeCount: 1 })
    };
    const service = new SapDirectoryService(prisma, cache, {} as any);

    const result = await service.refresh();

    expect(prisma.sapEmployeeDirectory.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ employeeId: null })
    }));
    expect(prisma.employee.updateMany).not.toHaveBeenCalled();
    expect(result).toEqual(expect.objectContaining({
      linked: 0,
      autoNameLinked: 0,
      localMatriculesUpdated: 0
    }));
  });

  it("manually links a SAP row to a selected BioTime employee", async () => {
    const prisma: any = {
      sapEmployeeDirectory: {
        findUnique: jest.fn().mockResolvedValue({ sapEmpId: "FABCOM_DEV-932" }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        update: jest.fn().mockResolvedValue({
          sapEmpId: "FABCOM_DEV-932",
          employeeId: "employee-128",
          biotimeId: "128",
          employee: {
            id: "employee-128",
            zktecoId: "128",
            biotimeCode: "",
            employeeCode: "128",
            localMatricule: "FABCOM_DEV-932",
            fullName: "MANSOURI ABDELHAKIM",
            department: "FAB ATELIER CHARGE",
            status: "ACTIVE"
          }
        })
      },
      employee: {
        findUnique: jest.fn().mockResolvedValue({
          id: "employee-128",
          zktecoId: "128",
          biotimeCode: "",
          employeeCode: "128",
          localMatricule: null,
          fullName: "MANSOURI ABDELHAKIM",
          department: "FAB ATELIER CHARGE",
          status: "ACTIVE"
        }),
        update: jest.fn().mockResolvedValue({})
      },
      $transaction: jest.fn(async (callback: any) => callback(prisma))
    };
    const service = new SapDirectoryService(prisma, {} as any, {} as any);

    const result = await service.linkManually({ sapEmpId: "FABCOM_DEV-932", employeeId: "employee-128" });

    expect(prisma.sapEmployeeDirectory.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { sapEmpId: "FABCOM_DEV-932" },
      data: { employeeId: "employee-128", biotimeId: "128" }
    }));
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: "employee-128" },
      data: { localMatricule: "FABCOM_DEV-932" }
    });
    expect(result).toEqual(expect.objectContaining({
      sapEmpId: "FABCOM_DEV-932",
      employeeId: "employee-128"
    }));
  });
});
