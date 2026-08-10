import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { APP_GUARD } from "@nestjs/core";
import { AuditModule } from "./audit/audit.module";
import { AdministrationModule } from "./administration/administration.module";
import { AdvancedTreatmentModule } from "./advanced-treatment/advanced-treatment.module";
import { AttendanceModule } from "./attendance/attendance.module";
import { AuthModule } from "./auth/auth.module";
import { ChatModule } from "./chat/chat.module";
import { DevicesModule } from "./devices/devices.module";
import { EmployeesModule } from "./employees/employees.module";
import { JwtAuthGuard } from "./auth/guards/jwt-auth.guard";
import { NotificationsModule } from "./notifications/notifications.module";
import { PermissionsGuard } from "./auth/guards/permissions.guard";
import { OrgModule } from "./org/org.module";
import { PrismaModule } from "./prisma/prisma.module";
import { ReportsModule } from "./reports/reports.module";
import { RolesModule } from "./roles/roles.module";
import { SapModule } from "./sap/sap.module";
import { ShiftsModule } from "./shifts/shifts.module";
import { SyncModule } from "./sync/sync.module";
import { UsersModule } from "./users/users.module";

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AdministrationModule,
    AdvancedTreatmentModule,
    AuditModule,
    AttendanceModule,
    AuthModule,
    ChatModule,
    DevicesModule,
    EmployeesModule,
    NotificationsModule,
    OrgModule,
    ReportsModule,
    RolesModule,
    SapModule,
    ShiftsModule,
    SyncModule,
    UsersModule
  ],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard
    }
  ]
})
export class AppModule {}
