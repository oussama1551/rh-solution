CREATE TABLE IF NOT EXISTS "absence_type_codes" (
  "code" VARCHAR(12) NOT NULL,
  "label" VARCHAR(180) NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "absence_type_codes_pkey" PRIMARY KEY ("code")
);

INSERT INTO "absence_type_codes" ("code", "label", "active")
VALUES
  ('AA', 'Absence Autorisée', true),
  ('ADC', 'Absence Début/Fin de Contrat', true),
  ('AFC', 'AFC', true),
  ('AI', 'Absence Irrégulière', true),
  ('AM', 'Absence Maladie', true),
  ('AMA', 'Absence Maternité', true),
  ('AMD', 'Mise à pied conservatoire', true),
  ('AR', 'Retard', true),
  ('AT', 'Accident de Travail', true),
  ('SAN', 'Mise à pied disciplinaire', true),
  ('AD', 'Absence Décès', true)
ON CONFLICT ("code") DO UPDATE SET
  "label" = EXCLUDED."label",
  "active" = EXCLUDED."active",
  "updated_at" = CURRENT_TIMESTAMP;

CREATE TABLE IF NOT EXISTS "absence_type_declarations" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "type_code" VARCHAR(12) NOT NULL,
  "note" TEXT,
  "declared_by" UUID,
  "status" "approval_status" NOT NULL DEFAULT 'PENDING_APPROVAL',
  "approved_by" UUID,
  "approved_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "absence_type_declarations_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'attendance_summary_records'
      AND column_name = 'absence_type_code'
  ) THEN
    ALTER TABLE "attendance_summary_records" ADD COLUMN "absence_type_code" VARCHAR(12);
  END IF;
END $$;

ALTER TABLE "absence_type_declarations"
  ADD CONSTRAINT "absence_type_declarations_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "absence_type_declarations"
  ADD CONSTRAINT "absence_type_declarations_type_code_fkey"
  FOREIGN KEY ("type_code") REFERENCES "absence_type_codes"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "absence_type_declarations"
  ADD CONSTRAINT "absence_type_declarations_declared_by_fkey"
  FOREIGN KEY ("declared_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "absence_type_declarations"
  ADD CONSTRAINT "absence_type_declarations_approved_by_fkey"
  FOREIGN KEY ("approved_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_summary_records"
  ADD CONSTRAINT "attendance_summary_records_absence_type_code_fkey"
  FOREIGN KEY ("absence_type_code") REFERENCES "absence_type_codes"("code") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS "absence_type_declarations_employee_id_date_key"
  ON "absence_type_declarations"("employee_id", "date");

CREATE INDEX IF NOT EXISTS "absence_type_codes_active_idx"
  ON "absence_type_codes"("active");

CREATE INDEX IF NOT EXISTS "absence_type_declarations_date_idx"
  ON "absence_type_declarations"("date");

CREATE INDEX IF NOT EXISTS "absence_type_declarations_type_code_idx"
  ON "absence_type_declarations"("type_code");

CREATE INDEX IF NOT EXISTS "absence_type_declarations_status_idx"
  ON "absence_type_declarations"("status");

CREATE INDEX IF NOT EXISTS "attendance_summary_records_absence_type_code_idx"
  ON "attendance_summary_records"("absence_type_code");
