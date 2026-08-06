CREATE TYPE "overtime_rate_type" AS ENUM ('RATE_50', 'RATE_75', 'RATE_100');

ALTER TABLE "overtime_declarations"
  ADD COLUMN "rate_type" "overtime_rate_type";

UPDATE "overtime_declarations"
SET "rate_type" = 'RATE_50'
WHERE "rate_type" IS NULL;

ALTER TABLE "overtime_declarations"
  ALTER COLUMN "rate_type" SET NOT NULL;

ALTER TABLE "attendance_summary_records"
  ADD COLUMN "overtime_hours_rate_50" DECIMAL(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN "overtime_hours_rate_75" DECIMAL(7,2) NOT NULL DEFAULT 0,
  ADD COLUMN "overtime_hours_rate_100" DECIMAL(7,2) NOT NULL DEFAULT 0;
