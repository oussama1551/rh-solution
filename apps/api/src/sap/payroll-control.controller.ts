import { Body, Controller, Get, Param, Patch, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { PayrollControlConfirmationDto, PayrollControlQueryDto, PayrollOperationalQueryDto, PayrollOperationalReviewDto, UpdatePayrollRubricMappingDto } from "./dto/payroll-control.dto";
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
  rubrics(@Query("period") period?: string) {
    return this.service.rubrics(period);
  }

  @Patch("rubrics/:code")
  updateRubric(@Param("code") code: string, @Body() dto: UpdatePayrollRubricMappingDto, @CurrentUser() user: RequestUser) {
    return this.service.updateRubric(code, dto.mapsTo, user);
  }

  @Get("rows")
  rows(@Query() query: PayrollControlQueryDto) {
    return this.service.rows(query);
  }

  @Get("export")
  async exportRows(@Query() query: PayrollControlQueryDto, @Res() response: Response) {
    const buffer = await this.service.exportRows(query);
    response.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    response.setHeader("Content-Disposition", `attachment; filename="controle-paie-bulletin-${query.period.replace(/[^0-9-]+/g, "-")}.xlsx"`);
    response.send(buffer);
  }

  @Get("periods")
  periods() {
    return this.service.periods();
  }

  @Post("confirm")
  confirm(@Body() dto: PayrollControlConfirmationDto, @CurrentUser() user: RequestUser) {
    return this.service.confirm(dto, user);
  }

  @Post("restore")
  restore(@Body() dto: PayrollControlConfirmationDto, @CurrentUser() user: RequestUser) {
    return this.service.restore(dto, user);
  }

  @Get("operational")
  operational(@Query() query: PayrollOperationalQueryDto, @CurrentUser() user: RequestUser) {
    return this.service.operationalRows(query, user);
  }

  @Post("operational/review")
  reviewOperational(@Body() dto: PayrollOperationalReviewDto, @CurrentUser() user: RequestUser) {
    return this.service.reviewOperational(dto, user);
  }
}
