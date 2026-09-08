CREATE TYPE "PayrollOperationalVerdict" AS ENUM ('GOOD', 'NOT_GOOD');

CREATE TABLE "payroll_operational_reviews" (
  "id" UUID NOT NULL,
  "source_key" VARCHAR(240) NOT NULL,
  "period" VARCHAR(40) NOT NULL,
  "category" VARCHAR(40) NOT NULL,
  "verdict" "PayrollOperationalVerdict" NOT NULL,
  "reviewed_by" UUID NOT NULL,
  "reviewed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "note" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "payroll_operational_reviews_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "payroll_operational_reviews_source_key_period_category_key" ON "payroll_operational_reviews"("source_key", "period", "category");
CREATE INDEX "payroll_operational_reviews_period_category_verdict_idx" ON "payroll_operational_reviews"("period", "category", "verdict");
CREATE INDEX "payroll_operational_reviews_reviewed_by_idx" ON "payroll_operational_reviews"("reviewed_by");
ALTER TABLE "payroll_operational_reviews" ADD CONSTRAINT "payroll_operational_reviews_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
