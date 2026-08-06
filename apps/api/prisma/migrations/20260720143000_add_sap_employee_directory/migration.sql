CREATE TABLE "sap_employee_directory" (
    "id" UUID NOT NULL,
    "sap_emp_id" VARCHAR(160) NOT NULL,
    "sap_company" VARCHAR(80) NOT NULL,
    "biotime_id" VARCHAR(80),
    "employee_id" UUID,
    "last_name" VARCHAR(160),
    "first_name" VARCHAR(160),
    "full_name" VARCHAR(240) NOT NULL,
    "poste" VARCHAR(180),
    "structure" VARCHAR(180),
    "hire_date" DATE,
    "mobile" VARCHAR(80),
    "raw_payload" JSONB,
    "last_synced_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sap_employee_directory_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sap_employee_directory_sap_emp_id_key" ON "sap_employee_directory"("sap_emp_id");
CREATE INDEX "sap_employee_directory_sap_company_idx" ON "sap_employee_directory"("sap_company");
CREATE INDEX "sap_employee_directory_biotime_id_idx" ON "sap_employee_directory"("biotime_id");
CREATE INDEX "sap_employee_directory_employee_id_idx" ON "sap_employee_directory"("employee_id");
CREATE INDEX "sap_employee_directory_full_name_idx" ON "sap_employee_directory"("full_name");

ALTER TABLE "sap_employee_directory"
ADD CONSTRAINT "sap_employee_directory_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;
