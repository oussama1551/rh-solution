import { Module } from "@nestjs/common";
import { PayrollSummaryEditorController } from "./payroll-summary-editor.controller";
import { PayrollSummaryEditorService } from "./payroll-summary-editor.service";

@Module({
  controllers: [PayrollSummaryEditorController],
  providers: [PayrollSummaryEditorService],
  exports: [PayrollSummaryEditorService]
})
export class PayrollSummaryEditorModule {}
