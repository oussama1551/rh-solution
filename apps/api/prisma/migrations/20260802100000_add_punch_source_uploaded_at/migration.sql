ALTER TABLE "attendance_punches"
  ADD COLUMN IF NOT EXISTS "source_uploaded_at" TIMESTAMPTZ(6);

CREATE INDEX IF NOT EXISTS "attendance_punches_source_uploaded_at_idx"
  ON "attendance_punches"("source_uploaded_at");
