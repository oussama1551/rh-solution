import { BadRequestException } from "@nestjs/common";
import { JobApprovalStatus, JobApproverType, JobDocumentStatus } from "@prisma/client";
import { JobDescriptionsService } from "../src/job-descriptions/job-descriptions.service";

const drh = { id: "drh-id", username: "drh", roles: ["DRH"], permissions: [] };
const grh = { id: "grh-id", username: "grh", roles: ["GRH"], permissions: [] };

function createService() {
  const prisma: any = {
    jobDescriptionApproval: { findMany: jest.fn() },
    jobApprovalWorkflow: { create: jest.fn() }
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = {
    notify: jest.fn().mockResolvedValue(undefined),
    userIdsByRoles: jest.fn().mockResolvedValue([]),
    adminDrhUserIds: jest.fn().mockResolvedValue([])
  };
  const pdf = { render: jest.fn() };
  return { service: new JobDescriptionsService(prisma, audit as any, notifications as any, pdf as any), prisma };
}

function approval(id: string, order: number, status: JobApprovalStatus, role = "DRH") {
  return {
    id,
    status,
    workflowStep: {
      stepOrder: order,
      approverType: JobApproverType.ROLE,
      approverRoleCode: role,
      approverUserId: null
    }
  };
}

describe("JobDescriptionsService validation workflow", () => {
  it("returns only the first pending step to its eligible reviewer", async () => {
    const { service, prisma } = createService();
    const first = approval("approval-1", 1, JobApprovalStatus.PENDING);
    const second = approval("approval-2", 2, JobApprovalStatus.PENDING);
    const version = {
      status: JobDocumentStatus.PENDING_APPROVAL,
      approvals: [first, second],
      description: { employee: {}, company: {}, jobPosition: null, createdBy: {} }
    };
    prisma.jobDescriptionApproval.findMany.mockResolvedValue([
      { ...first, version },
      { ...second, version }
    ]);

    await expect(service.validationQueue(drh as any)).resolves.toEqual([
      expect.objectContaining({ id: "approval-1" })
    ]);
    await expect(service.validationQueue(grh as any)).resolves.toEqual([]);
  });

  it("allows a directly assigned user and blocks another user", () => {
    const { service } = createService();
    const step = {
      approverType: JobApproverType.USER,
      approverUserId: "drh-id",
      approverRoleCode: null
    };

    expect((service as any).canReviewStep(step, drh)).toBe(true);
    expect((service as any).canReviewStep(step, grh)).toBe(false);
  });

  it("refuses duplicate step orders and employee approval until the employee portal exists", async () => {
    const { service, prisma } = createService();
    const base = { companyId: undefined, name: "Circuit standard" };

    await expect(service.createWorkflow({
      ...base,
      steps: [
        { stepOrder: 1, name: "DRH", approverType: JobApproverType.ROLE, approverRoleCode: "DRH" },
        { stepOrder: 1, name: "Admin", approverType: JobApproverType.ROLE, approverRoleCode: "ADMIN" }
      ]
    } as any, drh as any)).rejects.toBeInstanceOf(BadRequestException);

    await expect(service.createWorkflow({
      ...base,
      steps: [{ stepOrder: 1, name: "Salarié", approverType: JobApproverType.EMPLOYEE }]
    } as any, drh as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.jobApprovalWorkflow.create).not.toHaveBeenCalled();
  });
});
