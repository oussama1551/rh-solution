CREATE TYPE "attendance_summary_status" AS ENUM ('PRESENT', 'ABSENT', 'SICK', 'COMPENSATED', 'REST', 'INCOMPLETE');

CREATE TABLE "overtime_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "hours" DECIMAL(6,2) NOT NULL,
  "reason" TEXT,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "overtime_declarations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "overtime_declarations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "overtime_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "overtime_declarations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "absence_compensations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "absence_date" DATE NOT NULL,
  "compensation_date" DATE NOT NULL,
  "note" TEXT,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "absence_compensations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "absence_compensations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "absence_compensations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "absence_compensations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "sick_leave_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date_start" DATE NOT NULL,
  "date_end" DATE NOT NULL,
  "note" TEXT,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'APPROVED',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sick_leave_declarations_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "sick_leave_declarations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "sick_leave_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "attendance_summary_records" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "work_date" DATE NOT NULL,
  "status" "attendance_summary_status" NOT NULL,
  "worked_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "overtime_hours" DECIMAL(7,2) NOT NULL DEFAULT 0,
  "is_compensation" BOOLEAN NOT NULL DEFAULT false,
  "shift_type" "shift_type",
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "attendance_summary_records_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_summary_records_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "overtime_declarations_employee_id_date_idx" ON "overtime_declarations"("employee_id", "date");
CREATE INDEX "overtime_declarations_status_idx" ON "overtime_declarations"("status");
CREATE INDEX "absence_compensations_employee_id_absence_date_idx" ON "absence_compensations"("employee_id", "absence_date");
CREATE INDEX "absence_compensations_employee_id_compensation_date_idx" ON "absence_compensations"("employee_id", "compensation_date");
CREATE INDEX "absence_compensations_status_idx" ON "absence_compensations"("status");
CREATE INDEX "sick_leave_declarations_employee_id_date_start_date_end_idx" ON "sick_leave_declarations"("employee_id", "date_start", "date_end");
CREATE INDEX "sick_leave_declarations_status_idx" ON "sick_leave_declarations"("status");
CREATE UNIQUE INDEX "attendance_summary_records_employee_id_work_date_key" ON "attendance_summary_records"("employee_id", "work_date");
CREATE INDEX "attendance_summary_records_period_start_period_end_idx" ON "attendance_summary_records"("period_start", "period_end");
CREATE INDEX "attendance_summary_records_status_idx" ON "attendance_summary_records"("status");
CREATE INDEX "attendance_summary_records_employee_id_period_start_period_end_idx" ON "attendance_summary_records"("employee_id", "period_start", "period_end");
