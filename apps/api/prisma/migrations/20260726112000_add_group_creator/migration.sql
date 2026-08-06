ALTER TABLE "groups"
  ADD COLUMN "created_by_id" UUID;

CREATE INDEX "groups_created_by_id_idx" ON "groups"("created_by_id");

ALTER TABLE "groups"
  ADD CONSTRAINT "groups_created_by_id_fkey"
  FOREIGN KEY ("created_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
