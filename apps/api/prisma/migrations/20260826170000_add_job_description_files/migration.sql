CREATE TABLE "job_description_files" (
  "id" UUID NOT NULL,
  "version_id" UUID NOT NULL,
  "file_type" VARCHAR(20) NOT NULL DEFAULT 'PDF',
  "relative_path" VARCHAR(500) NOT NULL,
  "mime_type" VARCHAR(120) NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "original_name" VARCHAR(240) NOT NULL,
  "generated_by" UUID NOT NULL,
  "generated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "job_description_files_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "job_description_files_version_id_fkey" FOREIGN KEY ("version_id") REFERENCES "job_description_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "job_description_files_generated_by_fkey" FOREIGN KEY ("generated_by") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "job_description_files_version_id_file_type_key" ON "job_description_files"("version_id", "file_type");
CREATE INDEX "job_description_files_sha256_idx" ON "job_description_files"("sha256");
