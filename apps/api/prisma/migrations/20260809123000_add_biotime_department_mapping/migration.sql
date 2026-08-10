ALTER TABLE "sub_units"
  ADD COLUMN IF NOT EXISTS "biotime_department_code" VARCHAR(120);

CREATE INDEX IF NOT EXISTS "sub_units_biotime_department_code_idx"
  ON "sub_units"("biotime_department_code");
