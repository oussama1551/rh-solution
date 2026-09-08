import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { JobCompaniesController } from "./companies.controller";
import { JobDescriptionsController } from "./job-descriptions.controller";
import { JobDescriptionsService } from "./job-descriptions.service";
import { JobDescriptionPdfService } from "./job-description-pdf.service";
import { JobTemplatesController } from "./job-templates.controller";

@Module({
  imports: [AuditModule, NotificationsModule],
  controllers: [JobCompaniesController, JobTemplatesController, JobDescriptionsController],
  providers: [JobDescriptionsService, JobDescriptionPdfService],
  exports: [JobDescriptionsService]
})
export class JobDescriptionsModule {}
