import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module";
import { OrgController } from "./org.controller";
import { OrgService } from "./org.service";

@Module({
  imports: [NotificationsModule],
  controllers: [OrgController],
  providers: [OrgService],
  exports: [OrgService]
})
export class OrgModule {}
