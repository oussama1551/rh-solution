CREATE TYPE "attendance_flag_type" AS ENUM ('OUT_OF_WINDOW');
CREATE TYPE "attendance_flag_status" AS ENUM ('PENDING', 'VALIDATED', 'REJECTED');
CREATE TYPE "attendance_block_status" AS ENUM ('SCHEDULED', 'ACTIVE', 'COMPLETED', 'CANCELLED');

ALTER TABLE "attendance_punches"
  ADD COLUMN "counts_as_presence" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "attendance_flags" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "punch_id" UUID NOT NULL,
  "type" "attendance_flag_type" NOT NULL,
  "status" "attendance_flag_status" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "review_note" TEXT,
  "reviewed_by_id" UUID,
  "reviewed_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "attendance_flags_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "attendance_blocks" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "employee_id" UUID NOT NULL,
  "starts_at" TIMESTAMPTZ(6) NOT NULL,
  "ends_at" TIMESTAMPTZ(6) NOT NULL,
  "status" "attendance_block_status" NOT NULL DEFAULT 'SCHEDULED',
  "reason" TEXT NOT NULL,
  "created_by_id" UUID,
  "activated_at" TIMESTAMPTZ(6),
  "completed_at" TIMESTAMPTZ(6),
  "cancelled_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "attendance_blocks_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "attendance_blocks_time_range_check" CHECK ("ends_at" > "starts_at")
);

CREATE UNIQUE INDEX "attendance_flags_punch_id_type_key" ON "attendance_flags"("punch_id", "type");
CREATE INDEX "attendance_flags_status_type_idx" ON "attendance_flags"("status", "type");
CREATE INDEX "attendance_flags_reviewed_by_id_idx" ON "attendance_flags"("reviewed_by_id");

CREATE INDEX "attendance_blocks_employee_id_starts_at_ends_at_idx" ON "attendance_blocks"("employee_id", "starts_at", "ends_at");
CREATE INDEX "attendance_blocks_status_idx" ON "attendance_blocks"("status");

ALTER TABLE "attendance_flags"
  ADD CONSTRAINT "attendance_flags_punch_id_fkey"
  FOREIGN KEY ("punch_id") REFERENCES "attendance_punches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_flags"
  ADD CONSTRAINT "attendance_flags_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "attendance_blocks"
  ADD CONSTRAINT "attendance_blocks_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "attendance_blocks"
  ADD CONSTRAINT "attendance_blocks_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
