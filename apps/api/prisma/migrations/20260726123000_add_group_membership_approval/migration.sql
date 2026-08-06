CREATE TABLE "group_membership_changes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "employee_id" UUID NOT NULL,
    "from_group_id" UUID,
    "to_group_id" UUID,
    "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed_by_id" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "rejection_reason" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "group_membership_changes_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "group_membership_changes_employee_id_idx" ON "group_membership_changes"("employee_id");
CREATE INDEX "group_membership_changes_from_group_id_idx" ON "group_membership_changes"("from_group_id");
CREATE INDEX "group_membership_changes_to_group_id_idx" ON "group_membership_changes"("to_group_id");
CREATE INDEX "group_membership_changes_status_idx" ON "group_membership_changes"("status");

ALTER TABLE "group_membership_changes"
ADD CONSTRAINT "group_membership_changes_employee_id_fkey"
FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "group_membership_changes"
ADD CONSTRAINT "group_membership_changes_from_group_id_fkey"
FOREIGN KEY ("from_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "group_membership_changes"
ADD CONSTRAINT "group_membership_changes_to_group_id_fkey"
FOREIGN KEY ("to_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "group_membership_changes"
ADD CONSTRAINT "group_membership_changes_submitted_by_id_fkey"
FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "group_membership_changes"
ADD CONSTRAINT "group_membership_changes_reviewed_by_id_fkey"
FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
