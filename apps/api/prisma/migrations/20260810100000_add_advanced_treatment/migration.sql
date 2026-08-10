CREATE TYPE "advanced_treatment_risk_level" AS ENUM ('HIGH', 'MEDIUM', 'LOW');

ALTER TABLE "sap_employee_directory"
  ADD COLUMN IF NOT EXISTS "bank_account" VARCHAR(120);

CREATE TABLE "advanced_treatment_confirmations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "risk_level" "advanced_treatment_risk_level" NOT NULL,
  "empty_days" INTEGER NOT NULL DEFAULT 0,
  "punched_days" INTEGER NOT NULL DEFAULT 0,
  "justified_days" INTEGER NOT NULL DEFAULT 0,
  "bank_account" VARCHAR(120),
  "note" TEXT,
  "confirmed_by" UUID,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "advanced_treatment_confirmations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "advanced_treatment_confirmations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "advanced_treatment_confirmations_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "advanced_treatment_confirmations_employee_id_period_start_period_end_key"
  ON "advanced_treatment_confirmations"("employee_id", "period_start", "period_end");
CREATE INDEX "advanced_treatment_confirmations_period_start_period_end_idx"
  ON "advanced_treatment_confirmations"("period_start", "period_end");
CREATE INDEX "advanced_treatment_confirmations_risk_level_idx"
  ON "advanced_treatment_confirmations"("risk_level");
CREATE INDEX "advanced_treatment_confirmations_confirmed_by_idx"
  ON "advanced_treatment_confirmations"("confirmed_by");
