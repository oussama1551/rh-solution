ALTER TABLE "overtime_declarations"
  ADD COLUMN "rate_percent" DECIMAL(5,2);

UPDATE "overtime_declarations"
SET "rate_percent" = CASE "rate_type"
  WHEN 'RATE_75' THEN 75.00
  WHEN 'RATE_100' THEN 100.00
  ELSE 50.00
END
WHERE "rate_percent" IS NULL;

ALTER TABLE "overtime_declarations"
  ALTER COLUMN "rate_percent" SET NOT NULL;
