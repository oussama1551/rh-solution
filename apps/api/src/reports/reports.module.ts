import { Module } from "@nestjs/common";
import { ReportsController } from "./reports.controller";
import { ReportsExportService } from "./reports-export.service";
import { ReportsService } from "./reports.service";
import { AttendanceSummaryService } from "./attendance-summary.service";

@Module({
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, AttendanceSummaryService],
  exports: [ReportsService, AttendanceSummaryService]
})
export class ReportsModule {}
