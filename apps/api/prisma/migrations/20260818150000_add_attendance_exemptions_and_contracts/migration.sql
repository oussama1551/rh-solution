ALTER TYPE "attendance_summary_status" ADD VALUE IF NOT EXISTS 'CONTRACT_NOT_STARTED';
ALTER TYPE "attendance_summary_status" ADD VALUE IF NOT EXISTS 'CONTRACT_ENDED';

ALTER TABLE "employees"
  ADD COLUMN "attendance_tracking_exempt" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "attendance_exempt_reason" TEXT,
  ADD COLUMN "attendance_exempt_at" TIMESTAMPTZ(6),
  ADD COLUMN "attendance_exempt_by" UUID;

CREATE INDEX "employees_attendance_tracking_exempt_idx" ON "employees"("attendance_tracking_exempt");
ALTER TABLE "employees" ADD CONSTRAINT "employees_attendance_exempt_by_fkey" FOREIGN KEY ("attendance_exempt_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "employee_contracts" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "start_date" DATE NOT NULL,
  "end_date" DATE,
  "contract_type" VARCHAR(100),
  "reference" VARCHAR(120),
  "note" TEXT,
  "created_by" UUID NOT NULL,
  "updated_by" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "employee_contracts_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "employee_contracts_employee_id_start_date_end_date_idx" ON "employee_contracts"("employee_id", "start_date", "end_date");
CREATE INDEX "employee_contracts_end_date_idx" ON "employee_contracts"("end_date");
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "employee_contracts" ADD CONSTRAINT "employee_contracts_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
