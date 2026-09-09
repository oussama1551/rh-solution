ALTER TABLE "units"
  ADD COLUMN IF NOT EXISTS "position_change_decision_template" TEXT;

ALTER TABLE "resignation_decisions"
  ADD COLUMN IF NOT EXISTS "decision_type" VARCHAR(40) NOT NULL DEFAULT 'RESIGNATION';

CREATE INDEX IF NOT EXISTS "resignation_decisions_employee_id_decision_type_idx"
  ON "resignation_decisions"("employee_id", "decision_type");
