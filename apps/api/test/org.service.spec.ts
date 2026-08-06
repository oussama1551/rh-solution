import { BadRequestException } from "@nestjs/common";
import { ApprovalStatus } from "@prisma/client";
import { OrgService } from "../src/org/org.service";
import { RoleCode } from "../src/roles/role-codes";

const admin = { id: "admin-id", username: "admin", roles: [RoleCode.Admin], permissions: [] };
const managerA = { id: "manager-a", username: "resp-a", roles: [RoleCode.ResponsableDepartement], permissions: [] };

function createService() {
  const prisma = {
    group: {
      findMany: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn()
    },
    employee: {
      findUnique: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      updateMany: jest.fn()
    },
    employeeShiftAssignment: {
      count: jest.fn(),
      findMany: jest.fn().mockResolvedValue([]),
      upsert: jest.fn()
    },
    groupMembershipChange: {
      create: jest.fn(),
      createMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      count: jest.fn()
    },
    userSubUnitAccess: {
      findMany: jest.fn().mockResolvedValue([{ subUnitId: "sub-unit-1" }])
    }
  };
  const audit = { record: jest.fn() };
  const notifications = { notify: jest.fn(), adminDrhUserIds: jest.fn().mockResolvedValue(["admin"]) };
  return { service: new OrgService(prisma as any, audit as any, notifications as any), prisma, audit };
}

describe("OrgService group ownership restrictions", () => {
  it("filters groups by creator for a responsable and returns all groups for admin", async () => {
    const { service, prisma } = createService();
    prisma.group.findMany.mockResolvedValueOnce([
      { id: "group-a", name: "A", _count: { employees: 1 } }
    ]);
    prisma.group.findMany.mockResolvedValueOnce([
      { id: "group-a", name: "A", _count: { employees: 1 } },
      { id: "group-b", name: "B", _count: { employees: 2 } }
    ]);

    await service.listGroups("sub-unit-1", managerA as any);
    expect(prisma.group.findMany).toHaveBeenNthCalledWith(1, expect.objectContaining({
      where: { subUnitId: "sub-unit-1", createdById: "manager-a" }
    }));

    await service.listGroups("sub-unit-1", admin as any);
    expect(prisma.group.findMany).toHaveBeenNthCalledWith(2, expect.objectContaining({
      where: { subUnitId: "sub-unit-1" }
    }));
  });

  it("prevents a responsable from updating another responsable group", async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValueOnce({
      id: "group-b",
      name: "Group B",
      createdById: "manager-b",
      subUnitId: "sub-unit-1"
    });

    await expect(service.updateGroup("group-b", { name: "New" }, managerA as any)).rejects.toThrow(BadRequestException);
    expect(prisma.group.update).not.toHaveBeenCalled();
  });

  it("stores a responsable group creation as pending and owned by the creator", async () => {
    const { service, prisma } = createService();
    (prisma as any).subUnit = { findUnique: jest.fn().mockResolvedValue({ id: "sub-unit-1" }) };
    (prisma.group as any).create = jest.fn().mockResolvedValue({
      id: "group-a",
      name: "Group A",
      status: ApprovalStatus.PENDING_APPROVAL,
      createdById: "manager-a",
      _count: { employees: 0 }
    });

    await service.createGroup({ subUnitId: "sub-unit-1", name: "Group A" }, managerA as any);
    expect((prisma.group as any).create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        createdById: "manager-a",
        status: ApprovalStatus.PENDING_APPROVAL
      })
    }));
  });

  it("creates a pending membership change when a responsable changes an approved group with approved planning", async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValueOnce({
      id: "group-a",
      name: "Group A",
      status: ApprovalStatus.APPROVED,
      createdById: "manager-a",
      subUnitId: "sub-unit-1"
    });
    prisma.group.findMany.mockResolvedValueOnce([{ id: "group-a", status: ApprovalStatus.APPROVED }]);
    prisma.employeeShiftAssignment.count.mockResolvedValueOnce(7);
    prisma.employee.findUnique.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: "group-a",
      group: { id: "group-a", name: "Group A" }
    });
    prisma.groupMembershipChange.create.mockResolvedValue({
      id: "change-1",
      employeeId: "employee-1",
      fromGroupId: "group-a",
      toGroupId: null,
      status: ApprovalStatus.PENDING_APPROVAL
    });

    const result = await service.moveEmployee("employee-1", { groupId: null }, managerA as any);

    expect(prisma.employee.update).not.toHaveBeenCalled();
    expect(prisma.groupMembershipChange.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        employeeId: "employee-1",
        fromGroupId: "group-a",
        toGroupId: null,
        status: ApprovalStatus.PENDING_APPROVAL,
        submittedById: "manager-a"
      })
    }));
    expect((result as any).pendingApproval).toBe(true);
  });

  it("removes an employee immediately for a responsable while the group or planning is not approved yet", async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValueOnce({
      id: "group-a",
      name: "Group A",
      status: ApprovalStatus.PENDING_APPROVAL,
      createdById: "manager-a",
      subUnitId: "sub-unit-1"
    });
    prisma.group.findMany.mockResolvedValueOnce([{ id: "group-a", status: ApprovalStatus.PENDING_APPROVAL }]);
    prisma.employee.findUnique.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: "group-a",
      group: { id: "group-a", name: "Group A" }
    });
    prisma.employee.update.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: null,
      group: null
    });

    await service.moveEmployee("employee-1", { groupId: null }, managerA as any);

    expect(prisma.groupMembershipChange.create).not.toHaveBeenCalled();
    expect(prisma.employeeShiftAssignment.count).not.toHaveBeenCalled();
    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      data: { groupId: null }
    }));
  });

  it("removes an employee immediately for admin", async () => {
    const { service, prisma } = createService();
    prisma.group.findUnique.mockResolvedValueOnce({
      id: "group-a",
      name: "Group A",
      createdById: "manager-a",
      subUnitId: "sub-unit-1"
    });
    prisma.employee.findUnique.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: "group-a",
      group: { id: "group-a", name: "Group A" }
    });
    prisma.employee.update.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: null,
      group: null
    });

    await service.moveEmployee("employee-1", { groupId: null }, admin as any);

    expect(prisma.groupMembershipChange.create).not.toHaveBeenCalled();
    expect(prisma.employee.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "employee-1" },
      data: { groupId: null }
    }));
  });

  it("copies existing group planning when an admin adds an employee to a planned group", async () => {
    const { service, prisma } = createService();
    const templateDate = new Date("2026-07-26T00:00:00.000Z");
    prisma.group.findUnique.mockResolvedValueOnce({
      id: "group-a",
      name: "Group A",
      createdById: "manager-a",
      subUnitId: "sub-unit-1"
    });
    prisma.employee.findUnique.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: null,
      group: null
    });
    prisma.employee.update.mockResolvedValue({
      id: "employee-1",
      fullName: "Employee One",
      groupId: "group-a",
      group: { id: "group-a", name: "Group A" }
    });
    prisma.employeeShiftAssignment.findMany.mockResolvedValue([
      {
        date: templateDate,
        shiftDefinitionId: "shift-morning",
        status: ApprovalStatus.APPROVED,
        submissionId: null,
        submittedById: null,
        submittedAt: null,
        reviewedById: "admin-id",
        reviewedAt: new Date("2026-07-20T00:00:00.000Z")
      }
    ]);

    await service.moveEmployee("employee-1", { groupId: "group-a" }, admin as any);

    expect(prisma.employeeShiftAssignment.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        employeeId_date_status: {
          employeeId: "employee-1",
          date: templateDate,
          status: ApprovalStatus.APPROVED
        }
      },
      create: expect.objectContaining({
        employeeId: "employee-1",
        date: templateDate,
        shiftDefinitionId: "shift-morning",
        assignedVia: "group",
        sourceGroupId: "group-a"
      })
    }));
  });
});
