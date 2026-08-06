import { Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { BioTimeClientService } from "../sync/biotime-client.service";
import { UpdateLocalMatriculeDto } from "./dto/update-local-matricule.dto";

@Injectable()
export class EmployeesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly biotime?: BioTimeClientService,
    private readonly config?: ConfigService
  ) {}

  async list(actor?: RequestUser) {
    const employees = await this.prisma.employee.findMany({
      where: employeeScopeWhere(actor),
      orderBy: [{ status: "asc" }, { department: "asc" }, { fullName: "asc" }],
      include: {
        sapDirectoryRecords: {
          orderBy: { lastSyncedAt: "desc" },
          take: 1
        },
        group: {
          include: {
            subUnit: {
              include: { unit: true }
            }
          }
        },
        shiftAssignments: {
          where: {
            OR: [{ validTo: null }, { validTo: { gte: new Date() } }]
          },
          include: { shift: true },
          orderBy: { validFrom: "desc" },
          take: 1
        },
        attendanceBlocks: {
          where: { status: "ACTIVE" },
          orderBy: { startsAt: "desc" },
          take: 1
        }
      }
    });

    return employees.map(employee => this.withPresentationFields(employee));
  }

  async get(id: string, actor?: RequestUser) {
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      include: {
        shiftAssignments: {
          include: { shift: true },
          orderBy: { validFrom: "desc" }
        },
        attendanceBlocks: {
          orderBy: { startsAt: "desc" },
          take: 10
        },
        attendancePunches: {
          include: {
            shift: true,
            flags: true
          },
          orderBy: { punchTime: "desc" },
          take: 100
        },
        sapMappings: {
          orderBy: { matchedAt: "desc" },
          take: 10,
          include: {
            matchedBy: { select: { id: true, username: true, fullName: true } }
          }
        },
        sapDirectoryRecords: {
          orderBy: { lastSyncedAt: "desc" },
          take: 3
        },
        group: {
          include: {
            subUnit: {
              include: { unit: true }
            }
          }
        }
      }
    });

    if (!employee || !(await this.canAccessEmployee(employee.id, actor))) {
      throw new NotFoundException("Employé introuvable.");
    }

    return this.withPresentationFields(employee);
  }

  async getBiotimePhoto(id: string, actor?: RequestUser) {
    if (!(await this.canAccessEmployee(id, actor))) {
      throw new NotFoundException("Employé introuvable.");
    }
    const employee = await this.prisma.employee.findUnique({
      where: { id },
      select: { sourcePayload: true }
    });

    if (!employee) {
      throw new NotFoundException("Employé introuvable.");
    }

    const photoPath = this.extractBiotimePhotoPath(employee.sourcePayload);

    if (!photoPath || !this.biotime) {
      throw new NotFoundException("Photo BioTime introuvable.");
    }

    return this.biotime.downloadAsset(photoPath);
  }

  async updateLocalMatricule(id: string, dto: UpdateLocalMatriculeDto, actor?: RequestUser) {
    const before = await this.prisma.employee.findUnique({ where: { id } });

    if (!before) {
      throw new NotFoundException("Employé introuvable.");
    }

    const normalized = dto.localMatricule?.trim() || null;
    const updated = await this.prisma.employee.update({
      where: { id },
      data: { localMatricule: normalized }
    });

    await this.audit.record({
      userId: actor?.id,
      action: "employees.update_local_matricule",
      entityType: "employee",
      entityId: id,
      before: {
        id: before.id,
        zktecoId: before.zktecoId,
        biotimeCode: before.biotimeCode,
        employeeCode: before.employeeCode,
        localMatricule: before.localMatricule
      },
      after: {
        id: updated.id,
        zktecoId: updated.zktecoId,
        biotimeCode: updated.biotimeCode,
        employeeCode: updated.employeeCode,
        localMatricule: updated.localMatricule
      }
    });

    return updated;
  }

  private withPresentationFields<
    T extends {
      id: string;
      phone?: string | null;
      sourcePayload?: Prisma.JsonValue | null;
      sapDirectoryRecords?: Array<{ mobile: string | null }>;
    }
  >(employee: T) {
    const sapPhone = employee.sapDirectoryRecords?.find(record => record.mobile?.trim())?.mobile?.trim() || null;

    return {
      ...employee,
      sapPhone,
      displayPhone: sapPhone || employee.phone || null,
      photoUrl: this.resolveBrowserPhotoUrl(employee.sourcePayload),
      photoProxyUrl: this.extractBiotimePhotoPath(employee.sourcePayload) ? `/api/employees/${employee.id}/photo` : null
    };
  }

  private resolveBrowserPhotoUrl(sourcePayload?: Prisma.JsonValue | null) {
    const photo = this.extractBiotimePhotoPath(sourcePayload);

    if (!photo) {
      return null;
    }

    if (/^https?:\/\//i.test(photo)) {
      return photo;
    }

    const baseUrl = this.config?.get<string>("BIOTIME_BASE_URL")?.replace(/\/$/, "");
    if (baseUrl && photo.startsWith("/")) {
      return `${baseUrl}${photo}`;
    }

    return photo;
  }

  private extractBiotimePhotoPath(sourcePayload?: Prisma.JsonValue | null) {
    if (!sourcePayload || typeof sourcePayload !== "object" || Array.isArray(sourcePayload)) {
      return null;
    }

    const payload = sourcePayload as Prisma.JsonObject;
    const rawPhoto = payload.photo || payload.avatar || payload.image || payload.profile_photo;
    const photo = typeof rawPhoto === "string" ? rawPhoto.trim() : "";

    if (!photo || photo === "-") {
      return null;
    }

    return photo;
  }

  private async canAccessEmployee(id: string, actor?: RequestUser) {
    const scoped = employeeScopeWhere(actor);
    if (!Object.keys(scoped).length) return true;
    const count = await this.prisma.employee.count({ where: { id, ...scoped } });
    return count > 0;
  }
}
