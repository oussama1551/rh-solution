CREATE TYPE "device_status" AS ENUM ('ONLINE', 'OFFLINE', 'UNKNOWN');

CREATE TABLE "devices" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "zkteco_id" VARCHAR(120) NOT NULL,
  "serial_number" VARCHAR(120),
  "name" VARCHAR(160) NOT NULL,
  "ip_address" INET,
  "area" VARCHAR(160),
  "status" "device_status" NOT NULL DEFAULT 'UNKNOWN',
  "last_seen_at" TIMESTAMPTZ(6),
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL,

  CONSTRAINT "devices_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "devices_zkteco_id_key" ON "devices"("zkteco_id");
CREATE UNIQUE INDEX "devices_serial_number_key" ON "devices"("serial_number");
CREATE INDEX "devices_status_idx" ON "devices"("status");
CREATE INDEX "devices_last_seen_at_idx" ON "devices"("last_seen_at");
