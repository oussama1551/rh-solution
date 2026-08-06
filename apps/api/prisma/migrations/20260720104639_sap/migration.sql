-- DropIndex
DROP INDEX "employees_local_matricule_idx";

-- AlterTable
ALTER TABLE "employee_mappings" ALTER COLUMN "id" DROP DEFAULT;
