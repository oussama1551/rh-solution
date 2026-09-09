CREATE TABLE "payroll_summary_overrides" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "work_date" DATE NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "original_code" VARCHAR(20) NOT NULL,
  "override_code" VARCHAR(20) NOT NULL,
  "note" TEXT,
  "edited_by" UUID,
  "edited_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_summary_overrides_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_summary_overrides_employee_id_work_date_period_start_period_end_key" ON "payroll_summary_overrides"("employee_id", "work_date", "period_start", "period_end");
CREATE INDEX "payroll_summary_overrides_period_start_period_end_idx" ON "payroll_summary_overrides"("period_start", "period_end");
ALTER TABLE "payroll_summary_overrides" ADD CONSTRAINT "payroll_summary_overrides_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_summary_overrides" ADD CONSTRAINT "payroll_summary_overrides_edited_by_fkey" FOREIGN KEY ("edited_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "payroll_summary_override_history" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "work_date" DATE NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "previous_code" VARCHAR(20),
  "new_code" VARCHAR(20),
  "note" TEXT,
  "action" VARCHAR(20) NOT NULL,
  "changed_by" UUID,
  "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "payroll_summary_override_history_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "payroll_summary_override_history_employee_id_work_date_period_start_period_end_idx" ON "payroll_summary_override_history"("employee_id", "work_date", "period_start", "period_end");
CREATE INDEX "payroll_summary_override_history_changed_at_idx" ON "payroll_summary_override_history"("changed_at");
ALTER TABLE "payroll_summary_override_history" ADD CONSTRAINT "payroll_summary_override_history_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "payroll_summary_override_history" ADD CONSTRAINT "payroll_summary_override_history_changed_by_fkey" FOREIGN KEY ("changed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
