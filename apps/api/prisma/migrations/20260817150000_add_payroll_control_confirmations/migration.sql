CREATE TABLE "payroll_control_confirmations" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "rubric_scope" TEXT NOT NULL,
  "rubric_hash" VARCHAR(64) NOT NULL,
  "confirmed_by" UUID NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payroll_control_confirmations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "payroll_control_confirmations_employee_id_period_start_period_end_rubric_hash_key"
ON "payroll_control_confirmations"("employee_id", "period_start", "period_end", "rubric_hash");
CREATE INDEX "payroll_control_confirmations_period_start_period_end_rubric_hash_idx"
ON "payroll_control_confirmations"("period_start", "period_end", "rubric_hash");
CREATE INDEX "payroll_control_confirmations_confirmed_by_idx"
ON "payroll_control_confirmations"("confirmed_by");

ALTER TABLE "payroll_control_confirmations" ADD CONSTRAINT "payroll_control_confirmations_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_control_confirmations" ADD CONSTRAINT "payroll_control_confirmations_confirmed_by_fkey"
FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
