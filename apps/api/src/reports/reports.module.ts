import { Module } from "@nestjs/common";
import { PayrollSummaryEditorModule } from "../payroll-summary-editor/payroll-summary-editor.module";
import { ReportsController } from "./reports.controller";
import { ReportsExportService } from "./reports-export.service";
import { ReportsService } from "./reports.service";
import { AttendanceSummaryService } from "./attendance-summary.service";

@Module({
  imports: [PayrollSummaryEditorModule],
  controllers: [ReportsController],
  providers: [ReportsService, ReportsExportService, AttendanceSummaryService],
  exports: [ReportsService, AttendanceSummaryService, ReportsExportService]
})
export class ReportsModule {}
