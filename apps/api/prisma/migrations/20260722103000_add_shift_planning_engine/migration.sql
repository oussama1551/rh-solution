CREATE TYPE "shift_type" AS ENUM ('MORNING', 'EVENING', 'NIGHT', 'FLEXIBLE');
CREATE TYPE "shift_assignment_via" AS ENUM ('individual', 'group');

CREATE TABLE "shift_definitions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "shift_type" "shift_type" NOT NULL,
  "label" VARCHAR(80) NOT NULL,
  "start_time" VARCHAR(5),
  "end_time" VARCHAR(5),
  "spans_midnight" BOOLEAN NOT NULL DEFAULT false,
  "margin_minutes" INTEGER NOT NULL DEFAULT 90,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "shift_definitions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "employee_shift_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "date" DATE NOT NULL,
  "shift_definition_id" UUID NOT NULL,
  "assigned_via" "shift_assignment_via" NOT NULL,
  "source_group_id" UUID,
  "created_by" UUID,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "employee_shift_assignments_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "shift_definitions_shift_type_key" ON "shift_definitions"("shift_type");
CREATE UNIQUE INDEX "employee_shift_assignments_employee_id_date_key" ON "employee_shift_assignments"("employee_id", "date");
CREATE INDEX "employee_shift_assignments_date_idx" ON "employee_shift_assignments"("date");
CREATE INDEX "employee_shift_assignments_shift_definition_id_idx" ON "employee_shift_assignments"("shift_definition_id");
CREATE INDEX "employee_shift_assignments_source_group_id_idx" ON "employee_shift_assignments"("source_group_id");

ALTER TABLE "employee_shift_assignments"
  ADD CONSTRAINT "employee_shift_assignments_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employee_shift_assignments"
  ADD CONSTRAINT "employee_shift_assignments_shift_definition_id_fkey"
  FOREIGN KEY ("shift_definition_id") REFERENCES "shift_definitions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "employee_shift_assignments"
  ADD CONSTRAINT "employee_shift_assignments_source_group_id_fkey"
  FOREIGN KEY ("source_group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "employee_shift_assignments"
  ADD CONSTRAINT "employee_shift_assignments_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "shift_definitions" ("shift_type", "label", "start_time", "end_time", "spans_midnight", "margin_minutes")
VALUES
  ('MORNING', 'Matin', '06:00', '15:00', false, 90),
  ('EVENING', 'Soir', '15:00', '23:00', false, 90),
  ('NIGHT', 'Nuit', '23:00', '06:00', true, 120),
  ('FLEXIBLE', 'Normal / flexible', NULL, NULL, false, 0)
ON CONFLICT ("shift_type") DO NOTHING;
