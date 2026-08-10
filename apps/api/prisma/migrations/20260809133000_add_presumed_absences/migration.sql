CREATE TYPE "presumed_absence_status" AS ENUM ('PENDING_REVIEW', 'CONFIRMED', 'REJECTED');

CREATE TABLE "presumed_absences" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "detected_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "basis" VARCHAR(80) NOT NULL DEFAULT 'no_punch_heuristic',
  "status" "presumed_absence_status" NOT NULL DEFAULT 'PENDING_REVIEW',
  "reviewed_by" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "review_note" TEXT,

  CONSTRAINT "presumed_absences_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "presumed_absences_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "presumed_absences_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "presumed_absences_employee_id_date_key" ON "presumed_absences"("employee_id", "date");
CREATE INDEX "presumed_absences_date_idx" ON "presumed_absences"("date");
CREATE INDEX "presumed_absences_status_idx" ON "presumed_absences"("status");
CREATE INDEX "presumed_absences_reviewed_by_idx" ON "presumed_absences"("reviewed_by");
