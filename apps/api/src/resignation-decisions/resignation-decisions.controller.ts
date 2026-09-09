import { Body, Controller, Get, Param, Patch, Post, Res, UploadedFile, UseInterceptors } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { Response } from "express";
import { CurrentUser } from "../auth/decorators/current-user.decorator";
import { Permissions } from "../auth/decorators/permissions.decorator";
import { RequestUser } from "../common/request-user.type";
import { PermissionCode } from "../permissions/permission-codes";
import { ResignationDecisionsService } from "./resignation-decisions.service";

@Controller("resignation-decisions")
@Permissions(PermissionCode.EmployeesRead)
export class ResignationDecisionsController {
  constructor(private readonly service: ResignationDecisionsService) {}

  @Get("units") listUnits(@CurrentUser() actor: RequestUser) { return this.service.listUnits(actor); }
  @Patch("units/:id") updateUnit(@Param("id") id: string, @Body() body: Record<string, unknown>, @CurrentUser() actor: RequestUser) { return this.service.updateUnit(id, body, actor); }
  @Post("units/:id/logo")
  @UseInterceptors(FileInterceptor("logo", { limits: { fileSize: 3 * 1024 * 1024, files: 1 } }))
  uploadLogo(@Param("id") id: string, @UploadedFile() file: { buffer: Buffer; mimetype: string; originalname: string }, @CurrentUser() actor: RequestUser) { return this.service.uploadLogo(id, file, actor); }
  @Get("units/:id/logo") async logo(@Param("id") id: string, @Res() res: Response) { const asset = await this.service.getLogo(id); res.type(asset.mime).send(asset.buffer); }

  @Get("employee/:id") employeeState(@Param("id") id: string, @CurrentUser() actor: RequestUser) { return this.service.employeeState(id, actor); }
  @Post("employee/:id/generate") generate(@Param("id") id: string, @Body() body: { decisionDate?: string; effectiveDate?: string; regenerate?: boolean }, @CurrentUser() actor: RequestUser) { return this.service.generate(id, body, actor); }
  @Get(":id/download-data") async downloadData(@Param("id") id: string, @CurrentUser() actor: RequestUser) { const asset = await this.service.pdf(id, actor); return { fileName: `decision-demission-${asset.number.replace(/\//g, "-")}.pdf`, contentBase64: asset.buffer.toString("base64") }; }
  @Get(":id/pdf") async pdf(@Param("id") id: string, @CurrentUser() actor: RequestUser, @Res() res: Response) { const asset = await this.service.pdf(id, actor); res.setHeader("Content-Type", "application/pdf"); res.setHeader("Content-Disposition", `attachment; filename=decision-demission-${asset.number.replace(/\//g, "-")}.pdf`); res.send(asset.buffer); }
}
