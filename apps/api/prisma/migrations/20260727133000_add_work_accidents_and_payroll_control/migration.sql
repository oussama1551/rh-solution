ALTER TYPE "attendance_summary_status" ADD VALUE IF NOT EXISTS 'ACCIDENT';

CREATE TYPE "payroll_map_target" AS ENUM (
  'ABSENCE',
  'OVERTIME_50',
  'OVERTIME_75',
  'OVERTIME_100',
  'SICK',
  'ACCIDENT',
  'COMPENSATION',
  'IGNORED'
);

CREATE TABLE "work_accident_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date_start" DATE NOT NULL,
  "date_end" DATE NOT NULL,
  "note" TEXT,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'APPROVED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "work_accident_declarations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "work_accident_declarations_employee_id_date_start_date_end_idx" ON "work_accident_declarations"("employee_id", "date_start", "date_end");
CREATE INDEX "work_accident_declarations_status_idx" ON "work_accident_declarations"("status");
ALTER TABLE "work_accident_declarations" ADD CONSTRAINT "work_accident_declarations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "work_accident_declarations" ADD CONSTRAINT "work_accident_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payroll_rubric_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "rubric_code" VARCHAR(80) NOT NULL,
  "rubric_label" VARCHAR(240),
  "maps_to" "payroll_map_target" NOT NULL DEFAULT 'IGNORED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_rubric_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_rubric_mappings_rubric_code_key" ON "payroll_rubric_mappings"("rubric_code");
CREATE INDEX "payroll_rubric_mappings_maps_to_idx" ON "payroll_rubric_mappings"("maps_to");

CREATE TABLE "payroll_import_lines" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "period" VARCHAR(40) NOT NULL,
  "company" VARCHAR(80) NOT NULL,
  "sap_matricule" VARCHAR(120) NOT NULL,
  "last_name" VARCHAR(160),
  "first_name" VARCHAR(160),
  "rubric_code" VARCHAR(80) NOT NULL,
  "rubric_label" VARCHAR(240),
  "base" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "amount" DECIMAL(14,2) NOT NULL DEFAULT 0,
  "raw_payload" JSONB,
  "imported_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_import_lines_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "payroll_import_lines_period_idx" ON "payroll_import_lines"("period");
CREATE INDEX "payroll_import_lines_period_sap_matricule_idx" ON "payroll_import_lines"("period", "sap_matricule");
CREATE INDEX "payroll_import_lines_rubric_code_idx" ON "payroll_import_lines"("rubric_code");
CREATE INDEX "payroll_import_lines_company_idx" ON "payroll_import_lines"("company");
ALTER TABLE "payroll_import_lines" ADD CONSTRAINT "payroll_import_lines_rubric_code_fkey" FOREIGN KEY ("rubric_code") REFERENCES "payroll_rubric_mappings"("rubric_code") ON DELETE RESTRICT ON UPDATE CASCADE;
