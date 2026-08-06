CREATE TYPE "employee_mapping_method" AS ENUM ('auto_name_phone', 'auto_partial', 'manual');
CREATE TYPE "employee_mapping_status" AS ENUM ('confirmed', 'pending_review', 'rejected');

CREATE TABLE "employee_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "biotime_employee_id" UUID NOT NULL,
  "sap_emp_id" VARCHAR(160) NOT NULL,
  "sap_full_name" VARCHAR(240) NOT NULL,
  "sap_mobile" VARCHAR(80),
  "match_method" "employee_mapping_method" NOT NULL,
  "confidence_score" DOUBLE PRECISION NOT NULL,
  "status" "employee_mapping_status" NOT NULL,
  "matched_by" UUID,
  "matched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "metadata" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "employee_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employee_mappings_biotime_employee_id_sap_emp_id_key" ON "employee_mappings"("biotime_employee_id", "sap_emp_id");
CREATE INDEX "employee_mappings_biotime_employee_id_status_idx" ON "employee_mappings"("biotime_employee_id", "status");
CREATE INDEX "employee_mappings_sap_emp_id_idx" ON "employee_mappings"("sap_emp_id");
CREATE INDEX "employee_mappings_status_idx" ON "employee_mappings"("status");

ALTER TABLE "employee_mappings"
  ADD CONSTRAINT "employee_mappings_biotime_employee_id_fkey"
  FOREIGN KEY ("biotime_employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_mappings"
  ADD CONSTRAINT "employee_mappings_matched_by_fkey"
  FOREIGN KEY ("matched_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
