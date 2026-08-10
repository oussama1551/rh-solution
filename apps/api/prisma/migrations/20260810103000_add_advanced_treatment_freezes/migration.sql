CREATE TABLE "advanced_treatment_freezes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "period_start" DATE NOT NULL,
  "period_end" DATE NOT NULL,
  "frozen_by" UUID,
  "frozen_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reason" TEXT,

  CONSTRAINT "advanced_treatment_freezes_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "advanced_treatment_freezes_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "advanced_treatment_freezes_frozen_by_fkey" FOREIGN KEY ("frozen_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "advanced_treatment_freezes_employee_id_period_start_period_end_key"
  ON "advanced_treatment_freezes"("employee_id", "period_start", "period_end");
CREATE INDEX "advanced_treatment_freezes_period_start_period_end_idx"
  ON "advanced_treatment_freezes"("period_start", "period_end");
CREATE INDEX "advanced_treatment_freezes_frozen_by_idx"
  ON "advanced_treatment_freezes"("frozen_by");
