import { readFileSync } from "fs";
import { join } from "path";
import { substituteVariables } from "../src/resignation-decisions/resignation-decisions.service";

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
});
