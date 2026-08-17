ALTER TABLE "sick_leave_declarations"
ADD COLUMN "approved_by" UUID,
ADD COLUMN "approved_at" TIMESTAMPTZ(6);

CREATE INDEX "sick_leave_declarations_approved_by_idx"
ON "sick_leave_declarations"("approved_by");

ALTER TABLE "sick_leave_declarations"
ADD CONSTRAINT "sick_leave_declarations_approved_by_fkey"
FOREIGN KEY ("approved_by") REFERENCES "users"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
