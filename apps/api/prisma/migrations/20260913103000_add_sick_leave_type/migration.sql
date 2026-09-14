CREATE TYPE "sick_leave_type" AS ENUM ('MALADIE', 'ACCIDENT_TRAVAIL', 'DECES');

ALTER TABLE "sick_leave_declarations"
  ADD COLUMN "sick_leave_type" "sick_leave_type" NOT NULL DEFAULT 'MALADIE';

ALTER TABLE "attendance_summary_records"
  ADD COLUMN "sick_leave_type" "sick_leave_type";

CREATE INDEX "sick_leave_declarations_sick_leave_type_idx"
  ON "sick_leave_declarations"("sick_leave_type");
