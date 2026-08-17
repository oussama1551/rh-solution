CREATE TYPE "presumed_absence_case_type" AS ENUM ('PRESUMED_ABSENCE', 'UNEXPECTED_PRESENCE_ON_REST');

ALTER TABLE "presumed_absences"
  ADD COLUMN "case_type" "presumed_absence_case_type" NOT NULL DEFAULT 'PRESUMED_ABSENCE',
  ADD COLUMN "message" TEXT;

DROP INDEX "presumed_absences_employee_id_date_key";
CREATE UNIQUE INDEX "presumed_absences_employee_id_date_case_type_key"
  ON "presumed_absences"("employee_id", "date", "case_type");

CREATE INDEX "presumed_absences_case_type_idx" ON "presumed_absences"("case_type");
