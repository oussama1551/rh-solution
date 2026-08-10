ALTER TABLE IF EXISTS "attendance_summary_records"
  DROP CONSTRAINT IF EXISTS "attendance_summary_records_absence_type_code_fkey";

DROP INDEX IF EXISTS "attendance_summary_records_absence_type_code_idx";
DROP INDEX IF EXISTS "absence_type_declarations_status_idx";
DROP INDEX IF EXISTS "absence_type_declarations_type_code_idx";
DROP INDEX IF EXISTS "absence_type_declarations_date_idx";
DROP INDEX IF EXISTS "absence_type_declarations_employee_id_date_key";
DROP INDEX IF EXISTS "absence_type_codes_active_idx";

DROP TABLE IF EXISTS "absence_type_declarations";
DROP TABLE IF EXISTS "absence_type_codes";

ALTER TABLE IF EXISTS "attendance_summary_records"
  DROP COLUMN IF EXISTS "absence_type_code";
