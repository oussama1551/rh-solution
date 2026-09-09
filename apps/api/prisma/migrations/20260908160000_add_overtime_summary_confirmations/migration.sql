CREATE TABLE "overtime_summary_confirmations" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "confirmed_by" UUID NOT NULL,
  "confirmed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_summary_confirmations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "overtime_summary_confirmations_employee_id_period_start_period_end_key" ON "overtime_summary_confirmations"("employee_id", "period_start", "period_end");
CREATE INDEX "overtime_summary_confirmations_period_start_period_end_idx" ON "overtime_summary_confirmations"("period_start", "period_end");
ALTER TABLE "overtime_summary_confirmations" ADD CONSTRAINT "overtime_summary_confirmations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "overtime_summary_confirmations" ADD CONSTRAINT "overtime_summary_confirmations_confirmed_by_fkey" FOREIGN KEY ("confirmed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
