import { Controller, Get, Post, Query, Res } from "@nestjs/common";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { ReportsExportService } from "./reports-export.service";
import { ReportsQueryDto } from "./reports-query.dto";
import { ReportsService } from "./reports.service";
import { AttendanceSummaryService } from "./attendance-summary.service";

@Controller("reports")
export class ReportsController {
  constructor(
    private readonly reports: ReportsService,
    private readonly exports: ReportsExportService,
    private readonly summary: AttendanceSummaryService
  ) {}

  @Get("employees/monthly")
  @Permissions(PermissionCode.ReportsRead)
  monthlyByEmployee(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.reports.monthlyByEmployee(query, actor);
  }

  @Get("departments")
  @Permissions(PermissionCode.ReportsRead)
  departmentSummary(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.reports.departmentSummary(query, actor);
  }

  @Get("pointages/planning")
  @Permissions(PermissionCode.ReportsRead)
  pointagePlanning(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.reports.pointagePlanning(query, actor);
  }

  @Get("daily-absences")
  @Permissions(PermissionCode.ReportsRead)
  dailyAbsences(
    @Query("date") date?: string,
    @Query("unitId") unitId?: string,
    @Query("subUnitId") subUnitId?: string,
    @Query("groupId") groupId?: string,
    @Query("search") search?: string,
    @CurrentUser() actor?: RequestUser
  ) {
    return this.reports.dailyAbsences({ date, unitId, subUnitId, groupId, search }, actor);
  }

  @Get("dashboard")
  @Permissions(PermissionCode.ReportsRead)
  dashboard(@CurrentUser() actor: RequestUser) {
    return this.reports.dashboardKpis(actor);
  }

  @Get("summary")
  @Permissions(PermissionCode.ReportsRead)
  summaryReport(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.summary.report(query, actor);
  }

  @Get("summary/daily")
  @Permissions(PermissionCode.ReportsRead)
  summaryDaily(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.summary.dailyRecords(query, actor);
  }

  @Get("summary/generate")
  @Permissions(PermissionCode.ReportsRead)
  generateSummary(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.summary.generateForPeriod(query, actor);
  }

  @Post("summary/generate")
  @Permissions(PermissionCode.ReportsRead)
  generateSummaryPost(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser) {
    return this.summary.generateForPeriod(query, actor);
  }

  @Get("employees/monthly/export/excel")
  @Permissions(PermissionCode.ReportsExport)
  async monthlyExcel(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const rows = await this.reports.monthlyByEmployee(query, actor);
    const buffer = await this.exports.employeeMonthlyExcel(rows);
    this.sendFile(response, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "rapport-presence-mensuel.xlsx");
  }

  @Get("employees/monthly/export/pdf")
  @Permissions(PermissionCode.ReportsExport)
  async monthlyPdf(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const rows = await this.reports.monthlyByEmployee(query, actor);
    const buffer = await this.exports.employeeMonthlyPdf(rows);
    this.sendFile(response, buffer, "application/pdf", "rapport-presence-mensuel.pdf");
  }

  @Get("departments/export/excel")
  @Permissions(PermissionCode.ReportsExport)
  async departmentsExcel(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const rows = await this.reports.departmentSummary(query, actor);
    const buffer = await this.exports.departmentExcel(rows);
    this.sendFile(response, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "rapport-departements.xlsx");
  }

  @Get("departments/export/pdf")
  @Permissions(PermissionCode.ReportsExport)
  async departmentsPdf(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const rows = await this.reports.departmentSummary(query, actor);
    const buffer = await this.exports.departmentPdf(rows);
    this.sendFile(response, buffer, "application/pdf", "rapport-departements.pdf");
  }

  @Get("summary/export/excel")
  @Permissions(PermissionCode.ReportsExport)
  async summaryExcel(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const rows = await this.summary.report(query, actor);
    const buffer = await this.exports.summaryExcel(rows);
    this.sendFile(response, buffer, "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "rapport-synthese.xlsx");
  }

  @Get("summary/export/pdf")
  @Permissions(PermissionCode.ReportsExport)
  async summaryPdf(@Query() query: ReportsQueryDto, @CurrentUser() actor: RequestUser, @Res() response: Response) {
    const rows = await this.summary.report(query, actor);
    const buffer = await this.exports.summaryPdf(rows);
    this.sendFile(response, buffer, "application/pdf", "rapport-synthese.pdf");
  }

  private sendFile(response: Response, buffer: Buffer, contentType: string, filename: string) {
    response.setHeader("Content-Type", contentType);
    response.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    response.setHeader("Content-Length", buffer.length);
    response.end(buffer);
  }
}
