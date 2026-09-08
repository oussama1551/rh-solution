CREATE TABLE "manual_absence_declarations" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "absence_date" DATE NOT NULL,
  "reason" TEXT NOT NULL,
  "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "declared_by" UUID,
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "manual_absence_declarations_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "manual_absence_declarations_employee_id_absence_date_key" ON "manual_absence_declarations"("employee_id", "absence_date");
CREATE INDEX "manual_absence_declarations_status_idx" ON "manual_absence_declarations"("status");
CREATE INDEX "manual_absence_declarations_declared_by_idx" ON "manual_absence_declarations"("declared_by");
CREATE INDEX "manual_absence_declarations_approved_by_idx" ON "manual_absence_declarations"("approved_by");
ALTER TABLE "manual_absence_declarations" ADD CONSTRAINT "manual_absence_declarations_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "manual_absence_declarations" ADD CONSTRAINT "manual_absence_declarations_declared_by_fkey" FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "manual_absence_declarations" ADD CONSTRAINT "manual_absence_declarations_approved_by_fkey" FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
