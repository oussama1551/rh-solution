ALTER TYPE "attendance_summary_status" ADD VALUE IF NOT EXISTS 'LEAVE';

ALTER TYPE "notification_type" ADD VALUE IF NOT EXISTS 'LEAVE_DECLARED';

CREATE TABLE "leave_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date_start" DATE NOT NULL,
  "date_end" DATE NOT NULL,
  "note" TEXT,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "leave_declarations_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "leave_declarations_employee_id_date_start_date_end_idx" ON "leave_declarations"("employee_id", "date_start", "date_end");
CREATE INDEX "leave_declarations_status_idx" ON "leave_declarations"("status");
ALTER TABLE "leave_declarations" ADD CONSTRAINT "leave_declarations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "leave_declarations" ADD CONSTRAINT "leave_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_declarations" ADD CONSTRAINT "leave_declarations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
