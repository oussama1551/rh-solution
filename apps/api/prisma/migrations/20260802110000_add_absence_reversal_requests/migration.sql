ALTER TYPE "attendance_summary_status" ADD VALUE IF NOT EXISTS 'ABSENCE_REVERSED';

CREATE TABLE IF NOT EXISTS "absence_reversal_requests" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "absence_date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "absence_reversal_requests_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "absence_reversal_requests"
  ADD CONSTRAINT "absence_reversal_requests_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "absence_reversal_requests"
  ADD CONSTRAINT "absence_reversal_requests_declared_by_fkey"
  FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "absence_reversal_requests"
  ADD CONSTRAINT "absence_reversal_requests_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX IF NOT EXISTS "absence_reversal_requests_employee_id_absence_date_idx"
  ON "absence_reversal_requests"("employee_id", "absence_date");

CREATE INDEX IF NOT EXISTS "absence_reversal_requests_status_idx"
  ON "absence_reversal_requests"("status");
