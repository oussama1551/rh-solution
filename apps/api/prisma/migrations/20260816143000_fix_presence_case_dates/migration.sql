-- Dates were previously built at local midnight, then serialized to UTC on the previous day.
DROP INDEX "presumed_absences_employee_id_date_case_type_key";

UPDATE "presumed_absences"
SET "date" = "date" + 1;

CREATE UNIQUE INDEX "presumed_absences_employee_id_date_case_type_key"
  ON "presumed_absences"("employee_id", "date", "case_type");
