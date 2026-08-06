CREATE TYPE "sync_status" AS ENUM ('RUNNING', 'SUCCESS', 'FAILED');

ALTER TABLE "employees"
  ADD COLUMN "biotime_code" VARCHAR(120),
  ADD COLUMN "source_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "source_payload" JSONB;

ALTER TABLE "attendance_punches"
  ADD COLUMN "biotime_id" VARCHAR(120);

ALTER TABLE "devices"
  ADD COLUMN "biotime_id" VARCHAR(120),
  ADD COLUMN "source_updated_at" TIMESTAMPTZ(6),
  ADD COLUMN "source_payload" JSONB;

CREATE UNIQUE INDEX "attendance_punches_biotime_id_key" ON "attendance_punches"("biotime_id");
CREATE UNIQUE INDEX "devices_biotime_id_key" ON "devices"("biotime_id");

CREATE TABLE "resigns" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "biotime_id" VARCHAR(120) NOT NULL,
  "employee_id" UUID,
  "employee_zkteco_id" VARCHAR(80),
  "resign_date" DATE,
  "reason" TEXT,
  "source_updated_at" TIMESTAMPTZ(6),
  "source_payload" JSONB,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "resigns_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "resigns_biotime_id_key" ON "resigns"("biotime_id");
CREATE INDEX "resigns_employee_zkteco_id_idx" ON "resigns"("employee_zkteco_id");
CREATE INDEX "resigns_resign_date_idx" ON "resigns"("resign_date");

ALTER TABLE "resigns"
  ADD CONSTRAINT "resigns_employee_id_fkey"
  FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "sync_log" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "started_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finished_at" TIMESTAMPTZ(6),
  "status" "sync_status" NOT NULL DEFAULT 'RUNNING',
  "trigger" VARCHAR(40) NOT NULL,
  "employees_count" INTEGER NOT NULL DEFAULT 0,
  "resigns_count" INTEGER NOT NULL DEFAULT 0,
  "devices_count" INTEGER NOT NULL DEFAULT 0,
  "punches_count" INTEGER NOT NULL DEFAULT 0,
  "error_message" TEXT,
  "last_cursor" JSONB,
  "metadata" JSONB,

  CONSTRAINT "sync_log_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "sync_log_status_idx" ON "sync_log"("status");
CREATE INDEX "sync_log_started_at_idx" ON "sync_log"("started_at");
