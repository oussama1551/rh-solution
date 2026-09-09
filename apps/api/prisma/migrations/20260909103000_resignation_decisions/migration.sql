ALTER TABLE "units"
  ADD COLUMN "legal_logo_path" TEXT,
  ADD COLUMN "full_legal_name" VARCHAR(240),
  ADD COLUMN "legal_form" VARCHAR(120),
  ADD COLUMN "legal_address" TEXT,
  ADD COLUMN "capital_social" VARCHAR(120),
  ADD COLUMN "rc_number" VARCHAR(120),
  ADD COLUMN "nif_number" VARCHAR(120),
  ADD COLUMN "art_number" VARCHAR(120),
  ADD COLUMN "legal_phones" VARCHAR(240),
  ADD COLUMN "legal_email" VARCHAR(180),
  ADD COLUMN "legal_website" VARCHAR(180),
  ADD COLUMN "gerant_name" VARCHAR(180),
  ADD COLUMN "gerant_title" VARCHAR(180),
  ADD COLUMN "resignation_decision_template" TEXT;

CREATE TABLE "resignation_decision_sequences" (
  "id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "year" INTEGER NOT NULL,
  "last_number" INTEGER NOT NULL DEFAULT 0,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT "resignation_decision_sequences_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "resignation_decisions" (
  "id" UUID NOT NULL,
  "employee_id" UUID NOT NULL,
  "unit_id" UUID NOT NULL,
  "sequence_year" INTEGER NOT NULL,
  "sequence_number" INTEGER NOT NULL,
  "decision_number" VARCHAR(80) NOT NULL,
  "decision_date" DATE NOT NULL,
  "effective_date" DATE NOT NULL,
  "generated_by" UUID NOT NULL,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "pdf_file_path" TEXT NOT NULL,
  "document_snapshot" JSONB NOT NULL,
  CONSTRAINT "resignation_decisions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resignation_decision_sequences_unit_id_year_key" ON "resignation_decision_sequences"("unit_id", "year");
CREATE UNIQUE INDEX "resignation_decisions_unit_id_sequence_year_sequence_number_key" ON "resignation_decisions"("unit_id", "sequence_year", "sequence_number");
CREATE INDEX "resignation_decisions_employee_id_generated_at_idx" ON "resignation_decisions"("employee_id", "generated_at");
ALTER TABLE "resignation_decision_sequences" ADD CONSTRAINT "resignation_decision_sequences_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "resignation_decisions" ADD CONSTRAINT "resignation_decisions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resignation_decisions" ADD CONSTRAINT "resignation_decisions_unit_id_fkey" FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "resignation_decisions" ADD CONSTRAINT "resignation_decisions_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
