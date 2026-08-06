import { Module } from "@nestjs/common";
import { ShiftEngineService } from "./shift-engine.service";
import { ShiftsController } from "./shifts.controller";
import { ShiftsService } from "./shifts.service";

@Module({
  controllers: [ShiftsController],
  providers: [ShiftEngineService, ShiftsService],
  exports: [ShiftEngineService, ShiftsService]
})
export class ShiftsModule {}
