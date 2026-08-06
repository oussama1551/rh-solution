DO $$ BEGIN
  CREATE TYPE "leave_type" AS ENUM ('ANNUEL', 'EXCEPTIONNEL', 'SANS_SOLDE', 'MATERNITE');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "exceptional_leave_reason" AS ENUM ('MARIAGE_EMPLOYE', 'NAISSANCE_ENFANT', 'MARIAGE_ENFANT', 'DECES_CONJOINT', 'DECES_PARENT_PROCHE', 'CIRCONCISION_FILS', 'HAJJ');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;

ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "is_south_wilaya" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "sub_units"
  ADD COLUMN IF NOT EXISTS "is_south_wilaya" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "leave_declarations"
  ADD COLUMN IF NOT EXISTS "leave_type" "leave_type" NOT NULL DEFAULT 'ANNUEL',
  ADD COLUMN IF NOT EXISTS "exceptional_reason" "exceptional_leave_reason";

ALTER TABLE "attendance_summary_records"
  ADD COLUMN IF NOT EXISTS "leave_type" "leave_type",
  ADD COLUMN IF NOT EXISTS "exceptional_reason" "exceptional_leave_reason";

CREATE INDEX IF NOT EXISTS "leave_declarations_leave_type_idx" ON "leave_declarations"("leave_type");
CREATE INDEX IF NOT EXISTS "leave_declarations_exceptional_reason_idx" ON "leave_declarations"("exceptional_reason");
CREATE INDEX IF NOT EXISTS "attendance_summary_records_leave_type_idx" ON "attendance_summary_records"("leave_type");

CREATE TABLE IF NOT EXISTS "annual_leave_balances" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "days_entitled" DECIMAL(7,2) NOT NULL DEFAULT 30,
  "days_taken" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "days_remaining" DECIMAL(7,2) NOT NULL DEFAULT 30,
  "calculated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "annual_leave_balances_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "annual_leave_balances_employee_id_year_key" ON "annual_leave_balances"("employee_id", "year");
CREATE INDEX IF NOT EXISTS "annual_leave_balances_year_idx" ON "annual_leave_balances"("year");

DO $$ BEGIN
  ALTER TABLE "annual_leave_balances"
    ADD CONSTRAINT "annual_leave_balances_employee_id_fkey"
    FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
