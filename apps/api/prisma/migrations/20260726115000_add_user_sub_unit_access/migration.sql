CREATE TABLE "user_sub_unit_access" (
  "user_id" UUID NOT NULL,
  "sub_unit_id" UUID NOT NULL,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "user_sub_unit_access_pkey" PRIMARY KEY ("user_id", "sub_unit_id"),
  CONSTRAINT "user_sub_unit_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "user_sub_unit_access_sub_unit_id_fkey" FOREIGN KEY ("sub_unit_id") REFERENCES "sub_units"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "user_sub_unit_access_sub_unit_id_idx" ON "user_sub_unit_access"("sub_unit_id");
