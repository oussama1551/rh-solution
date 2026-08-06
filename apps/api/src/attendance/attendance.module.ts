import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { AttendanceBlocksService } from "./attendance-blocks.service";
import { AttendanceController } from "./attendance.controller";
import { AttendanceFlagsService } from "./attendance-flags.service";
import { AttendancePunchesService } from "./attendance-punches.service";
import { ShiftPlanningService } from "./shift-planning.service";
import { ManualDeclarationsService } from "./manual-declarations.service";

@Module({
  imports: [NotificationsModule],
  controllers: [AttendanceController],
  providers: [AttendanceFlagsService, AttendanceBlocksService, AttendancePunchesService, ShiftPlanningService, ManualDeclarationsService],
  exports: [AttendanceFlagsService, AttendanceBlocksService, AttendancePunchesService, ShiftPlanningService, ManualDeclarationsService]
})
export class AttendanceModule {}
