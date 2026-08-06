import { AttendancePunchesService } from "../src/attendance/attendance-punches.service";

function makeService() {
  const prisma = {
    attendancePunch: {
      findMany: jest.fn().mockResolvedValue([])
    },
    shiftDefinition: {
      findMany: jest.fn().mockResolvedValue([])
    },
    employeeShiftAssignment: {
      findMany: jest.fn().mockResolvedValue([])
    }
  };
  const flags = {};
  return { service: new AttendancePunchesService(prisma as never, flags as never), prisma };
}

function searchClause(where: any) {
  return where.AND.find((clause: any) => clause.OR);
}

describe("AttendancePunchesService", () => {
  it("searches detailed punches by linked SAP matricule", async () => {
    const { service, prisma } = makeService();

    await service.listDetailed({ search: "342" });

    const where = prisma.attendancePunch.findMany.mock.calls[0][0].where;
    expect(searchClause(where).OR).toContainEqual({
      employee: {
        sapDirectoryRecords: {
          some: {
            sapEmpId: { contains: "342", mode: "insensitive" }
          }
        }
      }
    });
  });

  it("searches daily realtime rows by linked SAP matricule", async () => {
    const { service, prisma } = makeService();

    await service.listDaily({ search: "342", from: "2026-07-26", to: "2026-07-30" });

    const where = prisma.attendancePunch.findMany.mock.calls[0][0].where;
    expect(searchClause(where).OR).toContainEqual({
      employee: {
        sapDirectoryRecords: {
          some: {
            sapEmpId: { contains: "342", mode: "insensitive" }
          }
        }
      }
    });
  });

});
