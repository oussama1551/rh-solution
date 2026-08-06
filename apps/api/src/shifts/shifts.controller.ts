import { Controller, Get } from "@nestjs/common";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { PermissionCode } from "../permissions/permission-codes";
import { ShiftsService } from "./shifts.service";

@Controller("shifts")
@Permissions(PermissionCode.ShiftsRead)
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  list() {
    return this.shifts.list();
  }
}
