import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { ReportsModule } from "../reports/reports.module";
import { AttendanceBlocksService } from "./attendance-blocks.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceFlagsService } from "./attendance-flags.service";
import { AttendancePunchesService } from "./attendance-punches.service";
import { ShiftPlanningService } from "./shift-planning.service";
import { ManualDeclarationsService } from "./manual-declarations.service";
import { PresumedAbsenceService } from "./presumed-absence.service";

@Module({
  imports: [NotificationsModule, ReportsModule],
  controllers: [AttendanceController],
  providers: [AttendanceFlagsService, AttendanceBlocksService, AttendancePunchesService, ShiftPlanningService, ManualDeclarationsService, PresumedAbsenceService],
  exports: [AttendanceFlagsService, AttendanceBlocksService, AttendancePunchesService, ShiftPlanningService, ManualDeclarationsService, PresumedAbsenceService]
})
export class AttendanceModule {}
