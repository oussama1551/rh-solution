CREATE TYPE "employee_status" AS ENUM ('ACTIVE', 'RESIGNED');
CREATE TYPE "day_of_week" AS ENUM ('MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY');
CREATE TYPE "punch_direction" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'UNKNOWN');
CREATE TYPE "punch_shift_status" AS ENUM ('ON_TIME', 'LATE', 'EARLY', 'OUT_OF_WINDOW', 'UNMATCHED');

CREATE TABLE "employees" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "zkteco_id" VARCHAR(80) NOT NULL,
  "employee_code" VARCHAR(80) NOT NULL,
  "full_name" VARCHAR(180) NOT NULL,
  "department" VARCHAR(160),
  "phone" VARCHAR(80),
  "hire_date" DATE,
  "resigned_at" DATE,
  "status" "employee_status" NOT NULL DEFAULT 'ACTIVE',
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "employees_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "shifts" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "code" VARCHAR(80) NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "start_time" VARCHAR(5) NOT NULL,
  "end_time" VARCHAR(5) NOT NULL,
  "spans_midnight" BOOLEAN NOT NULL,
  "applicable_days" "day_of_week"[],
  "tolerance_before_minutes" INTEGER NOT NULL DEFAULT 15,
  "tolerance_after_minutes" INTEGER NOT NULL DEFAULT 15,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "shifts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shifts_start_time_format_check" CHECK ("start_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "shifts_end_time_format_check" CHECK ("end_time" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  CONSTRAINT "shifts_tolerance_before_check" CHECK ("tolerance_before_minutes" >= 0),
  CONSTRAINT "shifts_tolerance_after_check" CHECK ("tolerance_after_minutes" >= 0)
);

CREATE TABLE "shift_assignments" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "shift_id" UUID NOT NULL,
  "valid_from" DATE NOT NULL,
  "valid_to" DATE,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "shift_assignments_valid_range_check" CHECK ("valid_to" IS NULL OR "valid_to" >= "valid_from")
);

CREATE TABLE "attendance_punches" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "shift_id" UUID,
  "zkteco_punch_id" VARCHAR(120),
  "punch_time" TIMESTAMPTZ(6) NOT NULL,
  "direction" "punch_direction" NOT NULL DEFAULT 'UNKNOWN',
  "shift_date" DATE,
  "shift_status" "punch_shift_status" NOT NULL DEFAULT 'UNMATCHED',
  "raw_payload" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "attendance_punches_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "employees_zkteco_id_key" ON "employees"("zkteco_id");
CREATE UNIQUE INDEX "employees_employee_code_key" ON "employees"("employee_code");
CREATE INDEX "employees_status_idx" ON "employees"("status");
CREATE INDEX "employees_full_name_idx" ON "employees"("full_name");

CREATE UNIQUE INDEX "shifts_code_key" ON "shifts"("code");
CREATE INDEX "shifts_is_active_idx" ON "shifts"("is_active");

CREATE INDEX "shift_assignments_employee_id_valid_from_valid_to_idx" ON "shift_assignments"("employee_id", "valid_from", "valid_to");
CREATE INDEX "shift_assignments_shift_id_idx" ON "shift_assignments"("shift_id");

CREATE UNIQUE INDEX "attendance_punches_zkteco_punch_id_key" ON "attendance_punches"("zkteco_punch_id");
CREATE INDEX "attendance_punches_employee_id_punch_time_idx" ON "attendance_punches"("employee_id", "punch_time");
CREATE INDEX "attendance_punches_shift_id_shift_date_idx" ON "attendance_punches"("shift_id", "shift_date");
CREATE INDEX "attendance_punches_shift_status_idx" ON "attendance_punches"("shift_status");

ALTER TABLE "shift_assignments"
  ADD CONSTRAINT "shift_assignments_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "shift_assignments"
  ADD CONSTRAINT "shift_assignments_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "attendance_punches"
  ADD CONSTRAINT "attendance_punches_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_punches"
  ADD CONSTRAINT "attendance_punches_shift_id_fkey"
  FOREIGN KEY ("shift_id") REFERENCES "shifts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
