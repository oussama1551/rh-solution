import { Module } from "@nestjs/common";
import { OvertimeSummaryController } from "./overtime-summary.controller";
import { OvertimeSummaryService } from "./overtime-summary.service";

@Module({ controllers: [OvertimeSummaryController], providers: [OvertimeSummaryService] })
export class OvertimeSummaryModule {}
