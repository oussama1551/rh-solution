import { findJobVariables, resolveJobVariables } from "../src/job-descriptions/job-variable-registry";

describe("job variable registry", () => {
  it("resolves only registered variables and reports unknown tokens", () => {
    const source = {
      text: "{{employee.full_name}} — {{job.title}} — {{danger.execute}}",
      nested: [{ value: "{{document.effective_date}}" }]
    };
    const result = resolveJobVariables(source, {
      employee: { fullName: "BENABID BILAL" },
      job: { title: "Chef de ligne" },
      document: { effectiveDate: "2026-09-01" }
    });

    expect(result.resolved.text).toBe("BENABID BILAL — Chef de ligne — {{danger.execute}}");
    expect(result.resolved.nested[0].value).toBe("01/09/2026");
    expect(result.unknownVariables).toEqual(["danger.execute"]);
  });

  it("uses safe samples for an A4 template preview without employee data", () => {
    const result = resolveJobVariables({ text: "{{employee.matricule}} / {{company.name}}" }, {}, true);
    expect(result.resolved.text).toBe("FABCOM_DEV-001 / FABCOM");
    expect(findJobVariables({ value: "{{job.title}} {{job.title}}" })).toEqual(["job.title"]);
  });
});
