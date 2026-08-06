ALTER TABLE "groups"
  ADD COLUMN "pending_name" VARCHAR(160),
  ADD COLUMN "pending_description" TEXT,
  ADD COLUMN "pending_delete_requested" BOOLEAN NOT NULL DEFAULT false;
