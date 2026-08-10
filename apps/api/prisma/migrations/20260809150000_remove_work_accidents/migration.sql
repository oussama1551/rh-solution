INSERT INTO "sick_leave_declarations" (
  "id",
  "employee_id",
  "date_start",
  "date_end",
  "note",
  "declared_by",
  "status",
  "created_at",
  "updated_at"
)
SELECT
  gen_random_uuid(),
  "employee_id",
  "date_start",
  "date_end",
  CASE
    WHEN "note" IS NULL OR btrim("note") = '' THEN 'Migré depuis Accident travail'
    ELSE 'Migré depuis Accident travail: ' || "note"
  END,
  "declared_by",
  "status",
  "created_at",
  "updated_at"
FROM "work_accident_declarations"
WHERE to_regclass('public.work_accident_declarations') IS NOT NULL;

DROP TABLE IF EXISTS "work_accident_declarations";

UPDATE "payroll_rubric_mappings"
SET "maps_to" = 'SICK'
WHERE "maps_to" = 'ACCIDENT';
