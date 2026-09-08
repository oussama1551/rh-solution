-- CreateEnum
CREATE TYPE "job_document_status" AS ENUM ('DRAFT', 'IN_REVIEW', 'PENDING_APPROVAL', 'VALIDATED', 'REJECTED', 'OBSOLETE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "job_approval_status" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "job_approver_type" AS ENUM ('MANAGER', 'ROLE', 'USER', 'EMPLOYEE');

-- CreateTable
CREATE TABLE "companies" (
    "id" UUID NOT NULL,
    "code" VARCHAR(30) NOT NULL,
    "official_name" VARCHAR(180) NOT NULL,
    "short_name" VARCHAR(100) NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(80),
    "email" VARCHAR(180),
    "legal_info" TEXT,
    "primary_color" VARCHAR(20),
    "footer_text" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "company_brandings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "asset_type" VARCHAR(40) NOT NULL DEFAULT 'LOGO',
    "relative_path" TEXT NOT NULL,
    "original_name" TEXT,
    "mime_type" VARCHAR(120) NOT NULL,
    "size_bytes" INTEGER NOT NULL,
    "sha256" VARCHAR(64) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "company_brandings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_positions" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "code" VARCHAR(80) NOT NULL,
    "title" VARCHAR(180) NOT NULL,
    "direction" VARCHAR(180),
    "department" VARCHAR(180),
    "service" VARCHAR(180),
    "hierarchical_reporting" VARCHAR(240),
    "functional_reporting" VARCHAR(240),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_positions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_position_aliases" (
    "id" UUID NOT NULL,
    "job_position_id" UUID NOT NULL,
    "company_id" UUID,
    "source" VARCHAR(40) NOT NULL DEFAULT 'SAP',
    "source_value" VARCHAR(240) NOT NULL,
    "normalized_value" VARCHAR(240) NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_position_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_approval_workflows" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "name" VARCHAR(160) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_approval_workflows_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_approval_workflow_steps" (
    "id" UUID NOT NULL,
    "workflow_id" UUID NOT NULL,
    "step_order" INTEGER NOT NULL,
    "label" VARCHAR(160) NOT NULL,
    "approver_type" "job_approver_type" NOT NULL,
    "approver_role_code" VARCHAR(60),
    "approver_user_id" UUID,
    "signature_required" BOOLEAN NOT NULL DEFAULT false,
    "stamp_required" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "job_approval_workflow_steps_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_description_templates" (
    "id" UUID NOT NULL,
    "job_position_id" UUID NOT NULL,
    "company_id" UUID,
    "workflow_id" UUID,
    "name" VARCHAR(180) NOT NULL,
    "visual_theme" VARCHAR(40) NOT NULL DEFAULT 'corporate',
    "orientation" VARCHAR(20) NOT NULL DEFAULT 'portrait',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "current_version_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_description_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_template_versions" (
    "id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "major_version" INTEGER NOT NULL DEFAULT 1,
    "minor_version" INTEGER NOT NULL DEFAULT 0,
    "status" "job_document_status" NOT NULL DEFAULT 'DRAFT',
    "content" JSONB NOT NULL,
    "validation_rules" JSONB,
    "revision_reason" TEXT,
    "content_hash" VARCHAR(64),
    "author_id" UUID NOT NULL,
    "validated_by" UUID,
    "validated_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_template_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mission_library_items" (
    "id" UUID NOT NULL,
    "company_id" UUID,
    "category" VARCHAR(120) NOT NULL,
    "code" VARCHAR(80),
    "label" VARCHAR(240) NOT NULL,
    "description" TEXT,
    "task_type" VARCHAR(80),
    "frequency" VARCHAR(40),
    "priority" INTEGER,
    "essential" BOOLEAN NOT NULL DEFAULT false,
    "default_kpi" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "mission_library_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_job_descriptions" (
    "id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "job_position_id" UUID,
    "reference" VARCHAR(180) NOT NULL,
    "status" "job_document_status" NOT NULL DEFAULT 'DRAFT',
    "effective_date" DATE,
    "end_date" DATE,
    "current_version_id" UUID,
    "created_by" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "employee_job_descriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_description_versions" (
    "id" UUID NOT NULL,
    "description_id" UUID NOT NULL,
    "template_version_id" UUID,
    "workflow_id" UUID,
    "major_version" INTEGER NOT NULL DEFAULT 1,
    "minor_version" INTEGER NOT NULL DEFAULT 0,
    "status" "job_document_status" NOT NULL DEFAULT 'DRAFT',
    "employee_snapshot" JSONB NOT NULL,
    "company_snapshot" JSONB NOT NULL,
    "job_snapshot" JSONB NOT NULL,
    "content" JSONB NOT NULL,
    "revision_reason" TEXT,
    "effective_date" DATE,
    "content_hash" VARCHAR(64),
    "author_id" UUID NOT NULL,
    "finalized_by" UUID,
    "finalized_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "job_description_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "job_description_approvals" (
    "id" UUID NOT NULL,
    "version_id" UUID NOT NULL,
    "workflow_step_id" UUID NOT NULL,
    "status" "job_approval_status" NOT NULL DEFAULT 'PENDING',
    "reviewed_by" UUID,
    "reviewed_at" TIMESTAMPTZ(6),
    "comment" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "job_description_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_reference_settings" (
    "id" UUID NOT NULL,
    "company_id" UUID NOT NULL,
    "document_type" VARCHAR(30) NOT NULL DEFAULT 'FP',
    "pattern" VARCHAR(240) NOT NULL,
    "next_sequence" INTEGER NOT NULL DEFAULT 1,
    "padding" INTEGER NOT NULL DEFAULT 3,
    "yearly_reset" BOOLEAN NOT NULL DEFAULT false,
    "sequence_year" INTEGER,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,

    CONSTRAINT "document_reference_settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "companies_code_key" ON "companies"("code");

-- CreateIndex
CREATE INDEX "companies_is_active_idx" ON "companies"("is_active");

-- CreateIndex
CREATE INDEX "company_brandings_company_id_asset_type_is_active_idx" ON "company_brandings"("company_id", "asset_type", "is_active");

-- CreateIndex
CREATE INDEX "job_positions_title_idx" ON "job_positions"("title");

-- CreateIndex
CREATE INDEX "job_positions_is_active_idx" ON "job_positions"("is_active");

-- CreateIndex
CREATE UNIQUE INDEX "job_positions_company_id_code_key" ON "job_positions"("company_id", "code");

-- CreateIndex
CREATE INDEX "job_position_aliases_job_position_id_idx" ON "job_position_aliases"("job_position_id");

-- CreateIndex
CREATE UNIQUE INDEX "job_position_aliases_source_company_id_normalized_value_key" ON "job_position_aliases"("source", "company_id", "normalized_value");

-- CreateIndex
CREATE INDEX "job_approval_workflows_company_id_is_active_idx" ON "job_approval_workflows"("company_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "job_approval_workflow_steps_workflow_id_step_order_key" ON "job_approval_workflow_steps"("workflow_id", "step_order");

-- CreateIndex
CREATE UNIQUE INDEX "job_description_templates_current_version_id_key" ON "job_description_templates"("current_version_id");

-- CreateIndex
CREATE INDEX "job_description_templates_job_position_id_is_active_idx" ON "job_description_templates"("job_position_id", "is_active");

-- CreateIndex
CREATE INDEX "job_description_templates_company_id_idx" ON "job_description_templates"("company_id");

-- CreateIndex
CREATE INDEX "job_template_versions_template_id_status_idx" ON "job_template_versions"("template_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_template_versions_template_id_major_version_minor_versi_key" ON "job_template_versions"("template_id", "major_version", "minor_version");

-- CreateIndex
CREATE INDEX "mission_library_items_category_is_active_idx" ON "mission_library_items"("category", "is_active");

-- CreateIndex
CREATE INDEX "mission_library_items_label_idx" ON "mission_library_items"("label");

-- CreateIndex
CREATE UNIQUE INDEX "employee_job_descriptions_reference_key" ON "employee_job_descriptions"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "employee_job_descriptions_current_version_id_key" ON "employee_job_descriptions"("current_version_id");

-- CreateIndex
CREATE INDEX "employee_job_descriptions_employee_id_status_idx" ON "employee_job_descriptions"("employee_id", "status");

-- CreateIndex
CREATE INDEX "employee_job_descriptions_company_id_idx" ON "employee_job_descriptions"("company_id");

-- CreateIndex
CREATE INDEX "employee_job_descriptions_job_position_id_idx" ON "employee_job_descriptions"("job_position_id");

-- CreateIndex
CREATE INDEX "job_description_versions_description_id_status_idx" ON "job_description_versions"("description_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "job_description_versions_description_id_major_version_minor_key" ON "job_description_versions"("description_id", "major_version", "minor_version");

-- CreateIndex
CREATE INDEX "job_description_approvals_status_idx" ON "job_description_approvals"("status");

-- CreateIndex
CREATE UNIQUE INDEX "job_description_approvals_version_id_workflow_step_id_key" ON "job_description_approvals"("version_id", "workflow_step_id");

-- CreateIndex
CREATE UNIQUE INDEX "document_reference_settings_company_id_document_type_key" ON "document_reference_settings"("company_id", "document_type");

-- AddForeignKey
ALTER TABLE "company_brandings" ADD CONSTRAINT "company_brandings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_positions" ADD CONSTRAINT "job_positions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_position_aliases" ADD CONSTRAINT "job_position_aliases_job_position_id_fkey" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_approval_workflows" ADD CONSTRAINT "job_approval_workflows_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_approval_workflows" ADD CONSTRAINT "job_approval_workflows_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_approval_workflow_steps" ADD CONSTRAINT "job_approval_workflow_steps_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "job_approval_workflows"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_templates" ADD CONSTRAINT "job_description_templates_job_position_id_fkey" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_templates" ADD CONSTRAINT "job_description_templates_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_templates" ADD CONSTRAINT "job_description_templates_workflow_id_fkey" FOREIGN KEY ("workflow_id") REFERENCES "job_approval_workflows"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_templates" ADD CONSTRAINT "job_description_templates_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_templates" ADD CONSTRAINT "job_description_templates_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "job_template_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_template_versions" ADD CONSTRAINT "job_template_versions_template_id_fkey" FOREIGN KEY ("template_id") REFERENCES "job_description_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_template_versions" ADD CONSTRAINT "job_template_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_template_versions" ADD CONSTRAINT "job_template_versions_validated_by_fkey" FOREIGN KEY ("validated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_library_items" ADD CONSTRAINT "mission_library_items_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mission_library_items" ADD CONSTRAINT "mission_library_items_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_job_descriptions" ADD CONSTRAINT "employee_job_descriptions_employee_id_fkey" FOREIGN KEY ("employee_id") REFERENCES "employees"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_job_descriptions" ADD CONSTRAINT "employee_job_descriptions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_job_descriptions" ADD CONSTRAINT "employee_job_descriptions_job_position_id_fkey" FOREIGN KEY ("job_position_id") REFERENCES "job_positions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_job_descriptions" ADD CONSTRAINT "employee_job_descriptions_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "employee_job_descriptions" ADD CONSTRAINT "employee_job_descriptions_current_version_id_fkey" FOREIGN KEY ("current_version_id") REFERENCES "job_description_versions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_versions" ADD CONSTRAINT "job_description_versions_description_id_fkey" FOREIGN KEY ("description_id") REFERENCES "employee_job_descriptions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_versions" ADD CONSTRAINT "job_description_versions_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_versions" ADD CONSTRAINT "job_description_versions_finalized_by_fkey" FOREIGN KEY ("finalized_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_approvals" ADD CONSTRAINT "job_description_approvals_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "job_description_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_approvals" ADD CONSTRAINT "job_description_approvals_workflow_step_id_fkey" FOREIGN KEY ("workflow_step_id") REFERENCES "job_approval_workflow_steps"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "job_description_approvals" ADD CONSTRAINT "job_description_approvals_reviewed_by_fkey" FOREIGN KEY ("reviewed_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_reference_settings" ADD CONSTRAINT "document_reference_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Initial configurable companies. These rows remain editable through the API.
INSERT INTO "companies" ("id", "code", "official_name", "short_name", "is_active", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'FABCOM', 'FABCOM', 'FABCOM', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'RECYCLAGE', 'RECYCLAGE', 'RECYCLAGE', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP),
  (gen_random_uuid(), 'NEWTECH', 'NEWTECH', 'NEWTECH', true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "document_reference_settings" ("id", "company_id", "document_type", "pattern", "next_sequence", "padding", "yearly_reset", "created_at", "updated_at")
SELECT gen_random_uuid(), "id", 'FP', '{{doc_type}}-{{company_code}}-{{department_code}}-{{job_code}}-{{sequence}}', 1, 3, false, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "companies"
WHERE "code" IN ('FABCOM', 'RECYCLAGE', 'NEWTECH')
ON CONFLICT ("company_id", "document_type") DO NOTHING;
