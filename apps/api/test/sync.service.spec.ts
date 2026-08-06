import { EmployeeStatus, SyncStatus } from "@prisma/client";
import { SyncService } from "../src/sync/sync.service";

describe("SyncService", () => {
  function makeService(overrides: Partial<Record<string, unknown>> = {}) {
    const prisma: any = {
      syncLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: "sync-1", startedAt: new Date(), status: SyncStatus.RUNNING }),
        update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: "sync-1", ...data })),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      employee: {
        upsert: jest.fn().mockResolvedValue({}),
        findUnique: jest.fn().mockResolvedValue(null),
        findFirst: jest.fn().mockResolvedValue(null),
        findMany: jest.fn().mockResolvedValue([]),
        count: jest.fn().mockResolvedValue(0),
        updateMany: jest.fn().mockResolvedValue({ count: 0 })
      },
      device: {
        upsert: jest.fn().mockResolvedValue({}),
        findFirst: jest.fn().mockResolvedValue(null)
      },
      resignRecord: {
        findFirst: jest.fn().mockResolvedValue(null)
      },
      attendancePunch: {
        findFirst: jest.fn().mockResolvedValue(null)
      },
      $transaction: jest.fn(async (callback: (tx: any) => unknown) => callback(prisma))
    };
    const biotime = {
      listEmployees: jest.fn().mockResolvedValue([]),
      listResigns: jest.fn().mockResolvedValue([]),
      listDevices: jest.fn().mockResolvedValue([]),
      listTransactions: jest.fn().mockResolvedValue([]),
      ...overrides
    };
    const service = new SyncService(
      prisma as never,
      biotime as never,
      { recordMatchedPunch: jest.fn() } as never,
      { record: jest.fn() } as never,
      { get: jest.fn().mockReturnValue("5") } as never,
      { notify: jest.fn(), adminItUserIds: jest.fn().mockResolvedValue(["admin"]) } as never
    );

    return { service, prisma, biotime };
  }

  it("journalise un échec BioTime sans supprimer les données locales", async () => {
    const { service, prisma, biotime } = makeService({
      listEmployees: jest.fn().mockRejectedValue(new Error("BioTime injoignable"))
    });

    const result = await service.run("manual", "user-1");

    expect(biotime.listEmployees).toHaveBeenCalled();
    expect(prisma.employee.upsert).not.toHaveBeenCalled();
    expect(prisma.syncLog.update).toHaveBeenCalledWith({
      where: { id: "sync-1" },
      data: expect.objectContaining({
        status: SyncStatus.FAILED,
        errorMessage: "BioTime injoignable"
      })
    });
    expect(result!.status).toBe(SyncStatus.FAILED);
  });

  it("remonte proprement une erreur BioTime 403 après échec de traitement amont", async () => {
    const error: any = new Error("Request failed with status code 403");
    error.response = { status: 403 };
    const { service, prisma, biotime } = makeService({
      listEmployees: jest.fn().mockRejectedValue(error)
    });

    const result = await service.run("scheduled");

    expect(biotime.listEmployees).toHaveBeenCalled();
    expect(prisma.employee.upsert).not.toHaveBeenCalled();
    expect(prisma.syncLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: SyncStatus.FAILED,
        errorMessage: "Request failed with status code 403"
      })
    }));
    expect(result!.status).toBe(SyncStatus.FAILED);
  });

  it("upsert les employés BioTime et marque le sync en succès", async () => {
    const { service, prisma } = makeService({
      listEmployees: jest.fn().mockResolvedValue([
        {
          id: 2026,
          emp_code: "2026",
          first_name: "BELAKHDAR",
          last_name: "OUSSAMA",
          department_name: "IT",
          update_time: "2026-07-19T08:00:00Z"
        }
      ])
    });

    const result = await service.run("manual", "user-1");

    expect(prisma.employee.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { zktecoId: "2026" }
    }));
    expect(prisma.syncLog.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: SyncStatus.SUCCESS,
        employeesCount: 1
      })
    }));
    expect(result!.status).toBe(SyncStatus.SUCCESS);
  });

  it("réactive un employé local RESIGNED présent dans employees BioTime et absent de resigns", async () => {
    const { service, prisma, biotime } = makeService({
      listEmployees: jest.fn().mockResolvedValue([
        {
          id: 1533,
          emp_code: "311",
          first_name: "ABABSA",
          last_name: "ABDELHAMID",
          department: { dept_name: "FAB PRODUCTION" },
          update_time: "2026-07-21 10:02:14"
        }
      ]),
      listResigns: jest.fn().mockResolvedValue([])
    });
    prisma.employee.count.mockResolvedValue(1);

    const result = await service.run("manual", "user-1", { full: true });

    expect(biotime.listEmployees).toHaveBeenCalledWith(undefined);
    expect(biotime.listResigns).toHaveBeenCalledWith(undefined);
    expect(prisma.employee.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { zktecoId: "1533" },
      update: expect.objectContaining({
        employeeCode: "311",
        status: EmployeeStatus.ACTIVE,
        resignedAt: null
      })
    }));
    expect(result!.metadata).toEqual(expect.objectContaining({
      full: true,
      reactivatedCount: 1
    }));
  });
});
