import { Module } from "@nestjs/common";
import { SapDirectoryCacheService } from "./sap-directory-cache.service";
import { SapDirectoryController } from "./sap-directory.controller";
import { SapDirectoryService } from "./sap-directory.service";
import { SapHanaClientService } from "./sap-client.service";
import { SyncModule } from "../sync/sync.module";
import { PayrollControlController } from "./payroll-control.controller";
import { PayrollControlService } from "./payroll-control.service";

@Module({
  imports: [SyncModule],
  controllers: [SapDirectoryController, PayrollControlController],
  providers: [SapHanaClientService, SapDirectoryCacheService, SapDirectoryService, PayrollControlService],
  exports: [SapDirectoryService, SapDirectoryCacheService]
})
export class SapModule {}
