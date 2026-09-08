import { BadRequestException } from "@nestjs/common";
import { JobDocumentStatus } from "@prisma/client";
import { JobDescriptionsService } from "../src/job-descriptions/job-descriptions.service";

const actor = { id: "admin-id", username: "admin", roles: ["ADMIN"], permissions: [] };

function builder() {
  return { schemaVersion: 1, page: { format: "A4", orientation: "portrait", visualTheme: "corporate" }, blocks: [] };
}

function createService() {
  const prisma: any = {
    employee: { findFirst: jest.fn() },
    company: { findUnique: jest.fn(), findMany: jest.fn() },
    jobPosition: { findUnique: jest.fn(), findMany: jest.fn() },
    jobDescriptionTemplate: { findUnique: jest.fn() },
    documentReferenceSetting: { upsert: jest.fn() },
    employeeJobDescription: { findFirst: jest.fn(), findMany: jest.fn(), update: jest.fn() },
    jobDescriptionVersion: { update: jest.fn(), findMany: jest.fn() },
    $transaction: jest.fn()
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const notifications = { notify: jest.fn(), userIdsByRoles: jest.fn(), adminDrhUserIds: jest.fn() };
  const pdf = { render: jest.fn() };
  return { service: new JobDescriptionsService(prisma, audit as any, notifications as any, pdf as any), prisma, audit };
}

describe("JobDescriptionsService snapshots", () => {
  it("copies the SAP job title and keeps a manual title only in the new document snapshot", async () => {
    const { service, prisma, audit } = createService();
    const employee = {
      id: "employee-id", localMatricule: "FABCOM_DEV-743", biotimeCode: "743", employeeCode: "5168",
      fullName: "BENABID BILAL", department: "Production", hireDate: new Date("2024-01-01"), status: "ACTIVE",
      group: { name: "CHAINE TBS G2", subUnit: { name: "FAB Production Assemblage", unit: { name: "FABCOM" } } },
      sapDirectoryRecords: [{ id: "sap-id", sapEmpId: "743", sapCompany: "FABCOM", poste: "Opérateur SAP", structure: "Assemblage", hireDate: new Date("2024-01-01"), updatedAt: new Date() }]
    };
    prisma.employee.findFirst.mockResolvedValue(employee);
    prisma.company.findUnique.mockResolvedValue({ id: "company-id", code: "FABCOM", officialName: "FABCOM", shortName: "FABCOM", isActive: true, brandings: [] });
    prisma.jobPosition.findUnique.mockResolvedValue(null);
    prisma.jobDescriptionTemplate.findUnique.mockResolvedValue(null);
    prisma.documentReferenceSetting.upsert.mockResolvedValue({ documentType: "FP", pattern: "{{doc_type}}-{{company_code}}-{{department_code}}-{{job_code}}-{{sequence}}", nextSequence: 2, padding: 3 });

    const tx: any = {
      employeeJobDescription: {
        create: jest.fn().mockResolvedValue({ id: "description-id" }),
        update: jest.fn().mockResolvedValue({ id: "description-id", reference: "FP-FABCOM-PRODUCTION-CHEFDELIGNE-001" })
      },
      jobDescriptionVersion: { create: jest.fn().mockResolvedValue({ id: "version-id" }) }
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.createDescription({
      employeeId: "employee-id", companyId: "company-id", selectedJobTitle: "Chef de ligne"
    }, actor as any);

    const versionData = tx.jobDescriptionVersion.create.mock.calls[0][0].data;
    expect(versionData.jobSnapshot.source.sapJobTitle).toBe("Opérateur SAP");
    expect(versionData.jobSnapshot.selected.jobTitle).toBe("Chef de ligne");
    expect(versionData.jobSnapshot.selected.manuallyEdited).toBe(true);
    expect(prisma.employee.update).toBeUndefined();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({
      metadata: expect.objectContaining({ sapJobTitle: "Opérateur SAP", selectedJobTitle: "Chef de ligne" })
    }));
  });

  it("uses the SAP title when no manual title or normalized position is selected", async () => {
    const { service, prisma } = createService();
    prisma.employee.findFirst.mockResolvedValue({
      id: "employee-id", localMatricule: "N-1", biotimeCode: null, employeeCode: "1", fullName: "EMPLOYEE",
      department: null, hireDate: null, status: "ACTIVE", group: null,
      sapDirectoryRecords: [{ id: "sap-id", sapEmpId: "1", sapCompany: "NEWTECH", poste: "Technicien Maintenance", structure: null, hireDate: null, updatedAt: new Date() }]
    });
    prisma.company.findUnique.mockResolvedValue({ id: "company-id", code: "NEWTECH", officialName: "NEWTECH", shortName: "NEWTECH", isActive: true, brandings: [] });
    prisma.documentReferenceSetting.upsert.mockResolvedValue({ documentType: "FP", pattern: "{{doc_type}}-{{company_code}}-{{department_code}}-{{job_code}}-{{sequence}}", nextSequence: 2, padding: 3 });
    const tx: any = {
      employeeJobDescription: { create: jest.fn().mockResolvedValue({ id: "description-id" }), update: jest.fn().mockResolvedValue({ id: "description-id" }) },
      jobDescriptionVersion: { create: jest.fn().mockResolvedValue({ id: "version-id" }) }
    };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));

    await service.createDescription({ employeeId: "employee-id", companyId: "company-id" }, actor as any);

    expect(tx.jobDescriptionVersion.create.mock.calls[0][0].data.jobSnapshot.selected).toEqual(expect.objectContaining({
      jobTitle: "Technicien Maintenance",
      manuallyEdited: false
    }));
  });

  it("refuses to overwrite a finalized employee document version", async () => {
    const { service, prisma } = createService();
    prisma.employeeJobDescription.findFirst.mockResolvedValue({
      id: "description-id",
      currentVersion: { id: "version-id", status: JobDocumentStatus.VALIDATED }
    });

    await expect(service.updateDescriptionDraft("description-id", { content: builder() }, actor as any))
      .rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.jobDescriptionVersion.update).not.toHaveBeenCalled();
  });
});

describe("JobDescriptionsService versions and import safety", () => {
  it("scopes document lists to employees owned by a supervisor", async () => {
    const { service, prisma } = createService();
    prisma.employeeJobDescription.findMany.mockResolvedValue([]);
    await service.listDescriptions({}, { id: "manager-id", roles: ["SUPERVISOR"] } as any);
    expect(prisma.employeeJobDescription.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ employee: { group: { createdById: "manager-id" } } }) }));
  });

  it("creates a minor revision without changing the validated source version", async () => {
    const { service, prisma, audit } = createService();
    const current = { id: "version-1", descriptionId: "description-id", majorVersion: 1, minorVersion: 0, status: JobDocumentStatus.VALIDATED, templateVersionId: null, workflowId: "workflow-id", employeeSnapshot: {}, companySnapshot: {}, jobSnapshot: {}, content: builder(), revisionReason: null, effectiveDate: null, contentHash: "hash" };
    prisma.employeeJobDescription.findFirst.mockResolvedValue({ id: "description-id", currentVersion: current });
    const tx: any = { jobDescriptionVersion: { create: jest.fn().mockResolvedValue({ id: "version-2", majorVersion: 1, minorVersion: 1 }) }, employeeJobDescription: { update: jest.fn() } };
    prisma.$transaction.mockImplementation((callback: any) => callback(tx));
    jest.spyOn(service, "getDescription").mockResolvedValue({ id: "description-id" } as any);

    await service.reviseDescription("description-id", { bump: "MINOR", reason: "Mise à jour des missions" }, actor as any);

    expect(tx.jobDescriptionVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ majorVersion: 1, minorVersion: 1, status: JobDocumentStatus.DRAFT, revisionReason: "Mise à jour des missions" }) }));
    expect(prisma.jobDescriptionVersion.update).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(expect.objectContaining({ action: "job_description.revise" }));
  });

  it("does not expose comparison data when scoped versions are not returned", async () => {
    const { service, prisma } = createService();
    prisma.jobDescriptionVersion.findMany.mockResolvedValue([]);
    await expect(service.compareVersions("description-id", "version-1", "version-2", { id: "manager", roles: ["SUPERVISOR"] } as any)).rejects.toThrow("n'appartient pas");
  });

  it("marks an already imported manual template as a duplicate", async () => {
    const { service, prisma } = createService();
    prisma.company.findMany.mockResolvedValue([{ id: "company-id", code: "FABCOM" }]);
    prisma.jobPosition.findMany.mockResolvedValue([{ id: "position-id", companyId: "company-id", code: "RESPIT", title: "Responsable IT", templates: [{ name: "Manuel — Responsable IT" }] }]);
    const preview = await service.previewOrganizationImport({ items: [{ companyCode: "FABCOM", jobCode: "RESPIT", jobTitle: "Responsable IT" }] });
    expect(preview[0].status).toBe("DUPLICATE");
  });

  it("rejects a company logo that is not a real PNG", async () => {
    const { service, prisma } = createService();
    prisma.company.findUnique.mockResolvedValue({ id: "company-id", code: "FABCOM" });
    await expect(service.uploadCompanyLogo("company-id", { mimetype: "image/png", buffer: Buffer.from("not a png"), originalname: "fake.png" } as any, actor as any)).rejects.toThrow("véritable fichier PNG");
  });
});
