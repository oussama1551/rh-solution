DROP INDEX IF EXISTS "attendance_summary_records_employee_id_work_date_key";

CREATE UNIQUE INDEX "attendance_summary_records_employee_id_work_date_period_start_period_end_key"
  ON "attendance_summary_records"("employee_id", "work_date", "period_start", "period_end");
