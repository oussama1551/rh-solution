import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { SapModule } from "../sap/sap.module";
import { AdvancedTreatmentController } from "./advanced-treatment.controller";
import { AdvancedTreatmentService } from "./advanced-treatment.service";

@Module({
  imports: [AuditModule, SapModule],
  controllers: [AdvancedTreatmentController],
  providers: [AdvancedTreatmentService]
})
export class AdvancedTreatmentModule {}
