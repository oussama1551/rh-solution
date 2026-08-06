CREATE TABLE "units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "name" VARCHAR(120) NOT NULL,
  "code" VARCHAR(80) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "sub_units" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "unit_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "sub_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "sub_unit_id" UUID NOT NULL,
  "name" VARCHAR(160) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "groups_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "employees" ADD COLUMN "group_id" UUID;

CREATE UNIQUE INDEX "units_code_key" ON "units"("code");
CREATE INDEX "units_name_idx" ON "units"("name");
CREATE UNIQUE INDEX "sub_units_unit_id_name_key" ON "sub_units"("unit_id", "name");
CREATE INDEX "sub_units_name_idx" ON "sub_units"("name");
CREATE UNIQUE INDEX "groups_sub_unit_id_name_key" ON "groups"("sub_unit_id", "name");
CREATE INDEX "groups_name_idx" ON "groups"("name");
CREATE INDEX "employees_group_id_idx" ON "employees"("group_id");

ALTER TABLE "sub_units"
  ADD CONSTRAINT "sub_units_unit_id_fkey"
  FOREIGN KEY ("unit_id") REFERENCES "units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_sub_unit_id_fkey"
  FOREIGN KEY ("sub_unit_id") REFERENCES "sub_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "employees"
  ADD CONSTRAINT "employees_group_id_fkey"
  FOREIGN KEY ("group_id") REFERENCES "groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

INSERT INTO "units" ("name", "code", "description")
VALUES
  ('FABCOM', 'FABCOM', 'Unité issue du schéma SAP FABCOM_DEV'),
  ('RECYCLAGE', 'RECYCLAGE', 'Unité issue du schéma SAP RECYCLAGE_DEV'),
  ('NEWTECH', 'NEWTECH', 'Unité issue du schéma SAP NEWTECH_DEV')
ON CONFLICT ("code") DO NOTHING;
