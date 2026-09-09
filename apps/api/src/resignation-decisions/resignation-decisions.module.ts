import { Module } from "@nestjs/common";
import { AuditModule } from "../audit/audit.module";
import { ResignationDecisionsController } from "./resignation-decisions.controller";
import { ResignationDecisionsService } from "./resignation-decisions.service";

@Module({ imports: [AuditModule], controllers: [ResignationDecisionsController], providers: [ResignationDecisionsService] })
export class ResignationDecisionsModule {}
