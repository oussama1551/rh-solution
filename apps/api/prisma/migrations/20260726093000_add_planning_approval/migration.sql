-- Approval workflow for organization groups and operational shift planning.
CREATE TYPE "approval_status" AS ENUM ('DRAFT', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED');

ALTER TABLE "groups"
  ADD COLUMN "status" "approval_status" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "submitted_by_id" UUID,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "rejection_reason" TEXT;

ALTER TABLE "employee_shift_assignments"
  ADD COLUMN "submission_id" UUID,
  ADD COLUMN "status" "approval_status" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "submitted_by_id" UUID,
  ADD COLUMN "submitted_at" TIMESTAMPTZ(6),
  ADD COLUMN "reviewed_by_id" UUID,
  ADD COLUMN "reviewed_at" TIMESTAMPTZ(6),
  ADD COLUMN "rejection_reason" TEXT;

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "groups_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_shift_assignments"
  ADD CONSTRAINT "employee_shift_assignments_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "employee_shift_assignments_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

DROP INDEX IF EXISTS "employee_shift_assignments_employee_id_date_key";

CREATE UNIQUE INDEX "employee_shift_assignments_employee_id_date_status_key"
  ON "employee_shift_assignments"("employee_id", "date", "status");

CREATE INDEX "groups_status_idx" ON "groups"("status");
CREATE INDEX "employee_shift_assignments_submission_id_idx" ON "employee_shift_assignments"("submission_id");
CREATE INDEX "employee_shift_assignments_status_idx" ON "employee_shift_assignments"("status");
