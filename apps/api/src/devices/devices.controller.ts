import { Controller, Get, Param } from "@nestjs/common";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { PermissionCode } from "../permissions/permission-codes";
import { DevicesService } from "./devices.service";

@Controller("devices")
@Permissions(PermissionCode.DevicesRead)
export class DevicesController {
  constructor(private readonly devices: DevicesService) {}

  @Get()
  list() {
    return this.devices.list();
  }

  @Get(":id")
  get(@Param("id") id: string) {
    return this.devices.get(id);
  }
}
