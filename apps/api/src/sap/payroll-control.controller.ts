import { Body, Controller, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { PayrollControlQueryDto, UpdatePayrollRubricMappingDto } from "./dto/payroll-control.dto";
import { PayrollControlService } from "./payroll-control.service";

@Controller("payroll-control")
@Permissions(PermissionCode.PayrollControl)
export class PayrollControlController {
  constructor(private readonly service: PayrollControlService) {}

  @Post("import")
  importPeriod(@Query("period") period: string, @CurrentUser() user: RequestUser) {
    return this.service.importPeriod(period, user);
  }

  @Get("rubrics")
  rubrics() {
    return this.service.rubrics();
  }

  @Patch("rubrics/:code")
  updateRubric(@Param("code") code: string, @Body() dto: UpdatePayrollRubricMappingDto, @CurrentUser() user: RequestUser) {
    return this.service.updateRubric(code, dto.mapsTo, user);
  }

  @Get("compare")
  compare(@Query() query: PayrollControlQueryDto) {
    return this.service.compare(query);
  }

  @Get("export.csv")
  async exportCsv(@Query() query: PayrollControlQueryDto, @Res() response: Response) {
    const csv = await this.service.csv(query);
    response.setHeader("Content-Type", "text/csv; charset=utf-8");
    response.setHeader("Content-Disposition", `attachment; filename="controle-paie-${query.period}.csv"`);
    response.end(`\uFEFF${csv}`);
  }
}
