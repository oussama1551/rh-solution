CREATE TYPE "probation_risk_level" AS ENUM ('TRES_ELEVE', 'MOYEN', 'FAIBLE');
CREATE TYPE "probation_review_status" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

CREATE TABLE "probation_reviews" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "hire_date" DATE NOT NULL,
    "window_start" DATE NOT NULL,
    "window_end" DATE NOT NULL,
    "punch_days_count" INTEGER NOT NULL,
    "empty_days_count" INTEGER NOT NULL,
    "risk_level" "probation_risk_level" NOT NULL,
    "status" "probation_review_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "review_note" TEXT,
    "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "probation_reviews_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "probation_reviews_employee_id_window_start_window_end_key" ON "probation_reviews"("employee_id", "window_start", "window_end");
CREATE INDEX "probation_reviews_window_start_window_end_idx" ON "probation_reviews"("window_start", "window_end");
CREATE INDEX "probation_reviews_risk_level_idx" ON "probation_reviews"("risk_level");
CREATE INDEX "probation_reviews_status_idx" ON "probation_reviews"("status");
CREATE INDEX "probation_reviews_reviewed_by_idx" ON "probation_reviews"("reviewed_by");

ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "probation_reviews" ADD CONSTRAINT "probation_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
