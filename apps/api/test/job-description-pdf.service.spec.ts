import { JobDescriptionPdfService } from "../src/job-descriptions/job-description-pdf.service";

describe("JobDescriptionPdfService", () => {
  it("renders a valid multi-section PDF from an immutable snapshot", async () => {
    const service = new JobDescriptionPdfService();
    const buffer = await service.render({
      reference: "FP-FAB-IT-RESPIT-001",
      effectiveDate: new Date("2026-09-01T00:00:00.000Z"),
      majorVersion: 1,
      minorVersion: 0,
      employeeSnapshot: { matricule: "FABCOM_DEV-001", fullName: "EMPLOYEE TEST", department: "IT", organization: { group: "Support" }, manager: { fullName: "MANAGER TEST" } },
      companySnapshot: { code: "FABCOM", shortName: "FABCOM", primaryColor: "#0f766e" },
      jobSnapshot: { source: { sapJobTitle: "Responsable IT" }, selected: { jobCode: "RESPIT", jobTitle: "Responsable IT" } },
      content: { schemaVersion: 1, page: { orientation: "portrait" }, blocks: [
        { order: 1, visible: true, type: "PURPOSE", title: "Mission", content: { text: "Assurer la mission de {{employee.full_name}}." } },
        { order: 2, visible: true, type: "TASKS", title: "Activités", content: { items: [{ label: "Administrer SAP", essential: true }] } },
        { order: 3, visible: true, type: "SIGNATURES", title: "Validation", content: {} }
      ] },
      approvals: []
    });

    expect(buffer.subarray(0, 5).toString()).toBe("%PDF-");
    expect(buffer.length).toBeGreaterThan(1500);
  });
});
