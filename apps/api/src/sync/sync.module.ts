import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AttendanceModule } from "../attendance/attendance.module";
import { AuditModule } from "../audit/audit.module";
import { NotificationsModule } from "../notifications/notifications.module";
import { BioTimeClientService } from "./biotime-client.service";
import { BioTimeLicenseService } from "./biotime-license.service";
import { SyncController } from "./sync.controller";
import { SyncService } from "./sync.service";

@Module({
  imports: [ScheduleModule.forRoot(), AttendanceModule, AuditModule, NotificationsModule],
  controllers: [SyncController],
  providers: [BioTimeClientService, BioTimeLicenseService, SyncService],
  exports: [SyncService, BioTimeClientService, BioTimeLicenseService]
})
export class SyncModule {}
