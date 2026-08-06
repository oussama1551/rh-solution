ALTER TABLE "employees"
  ADD COLUMN "local_matricule" VARCHAR(120);

CREATE INDEX "employees_local_matricule_idx" ON "employees"("local_matricule");
