import { readFileSync } from "fs";
import { join } from "path";
import { normalizeResignationTemplateForPdf, selectResignationDecisionTemplate, substituteVariables } from "../src/resignation-decisions/resignation-decisions.service";

describe("resignation decisions", () => {
  it("substitue les variables et rend les valeurs absentes visibles", () => {
    expect(substituteVariables("{{employee_name}} / {{employee_position}}", { employee_name: "أحمد" }))
      .toBe("أحمد / ___");
  });

  it("protège la numérotation concurrente par une unicité société/année/numéro", () => {
    const sql = readFileSync(join(__dirname, "../prisma/migrations/20260909103000_resignation_decisions/migration.sql"), "utf8");
    expect(sql).toContain("resignation_decisions_unit_id_sequence_year_sequence_number_key");
    expect(sql).toContain("UNIQUE INDEX");
  });

  it("conserve un instantané immuable avec chaque décision", () => {
    const sql = readFileSync(join(__dirname, "../prisma/migrations/20260909103000_resignation_decisions/migration.sql"), "utf8");
    expect(sql).toContain('"document_snapshot" JSONB NOT NULL');
    expect(sql).toContain('"pdf_file_path" TEXT NOT NULL');
  });

  it("ajoute un type de décision sans modifier les décisions existantes", () => {
    const sql = readFileSync(join(__dirname, "../prisma/migrations/20260909143000_hr_decision_types/migration.sql"), "utf8");
    expect(sql).toContain('"decision_type" VARCHAR(40) NOT NULL DEFAULT \'RESIGNATION\'');
    expect(sql).toContain('"position_change_decision_template" TEXT');
  });

  it("nettoie les marqueurs Markdown collés dans le modèle arabe", () => {
    expect(normalizeResignationTemplateForPdf("***المادة 01****: نص&#xA0;تجريبي"))
      .toBe("المادة 01: نص تجريبي");
  });

  it("conserve le gras volontaire dans le modèle", () => {
    expect(normalizeResignationTemplateForPdf("المادة 01: **نص مهم**"))
      .toBe("المادة 01: **نص مهم**");
  });

  it("ignore un modèle figé sans variables employé et dates", () => {
    const template = selectResignationDecisionTemplate("المادة 01: يوافق على استقالة السيد بومالي وائل من منصب مهندس في الصيانة.");
    expect(template).toContain("{{employee_name}}");
    expect(template).toContain("{{request_date}}");
    expect(template).toContain("{{effective_date_ar}}");
  });
});
