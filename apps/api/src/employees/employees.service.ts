import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Prisma } from "@prisma/client";
import axios from "axios";
import { AuditService } from "../audit/audit.service";
import { employeeScopeWhere } from "../common/employee-scope";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { RoleCode } from "../roles/role-codes";
import { BioTimeRecord } from "../sync/biotime.types";
import { BioTimeClientService } from "../sync/biotime-client.service";
import { dateField as bioTimeDateField } from "../sync/biotime-mapper";
import { BioTimeEmployeeDto } from "./dto/biotime-employee.dto";
import { ResignEmployeeDto } from "./dto/resign-employee.dto";
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

  async listResigned(filters: { q?: string; department?: string; resignType?: string; from?: string; to?: string }, actor?: RequestUser) {
    const resigns = await this.prisma.resignRecord.findMany({
      where: {
        resignDate: {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(filters.to) : undefined
        }
      },
      include: {
        employee: {
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
            }
          }
        }
      },
      orderBy: [{ resignDate: "desc" }, { updatedAt: "desc" }]
    });

    const q = filters.q?.trim().toLowerCase() || "";
    const department = filters.department?.trim().toLowerCase() || "";
    const resignType = filters.resignType?.trim().toLowerCase() || "";

    return resigns
      .map(row => ({
        id: row.id,
        biotimeId: row.biotimeId,
        resignDate: row.resignDate,
        reason: row.reason,
        resignType: resignTypeLabel(row.sourcePayload) || "Démissionner",
        employeeZktecoId: row.employeeZktecoId,
        employeeName: row.employee?.fullName || resignEmployeePayloadString(row.sourcePayload, ["full_name", "name", "format_name"]) || "-",
        employeeCode: row.employee?.localMatricule || row.employee?.biotimeCode || row.employee?.employeeCode || resignEmployeePayloadString(row.sourcePayload, ["emp_code", "employee_code", "code"]) || row.employeeZktecoId || "-",
        department: row.employee?.department || resignEmployeePayloadString(row.sourcePayload, ["dept_name", "department_name"]) || "-",
        status: row.employee?.status || "RESIGNED",
        employee: row.employee ? this.withPresentationFields(row.employee) : null
      }))
      .filter(row => {
        const employee = row.employee;
        const haystack = `${employee?.fullName || ""} ${employee?.employeeCode || ""} ${employee?.biotimeCode || ""} ${employee?.localMatricule || ""} ${row.employeeName} ${row.employeeCode} ${row.employeeZktecoId || ""}`.toLowerCase();
        return (!q || haystack.includes(q))
          && (!department || (row.department || "").toLowerCase().includes(department))
          && (!resignType || row.resignType.toLowerCase().includes(resignType));
      });
  }

  async punchHistory(id: string, filters: { from?: string; to?: string; limit?: string }, actor?: RequestUser) {
    if (!(await this.canAccessEmployee(id, actor))) {
      throw new NotFoundException("Employé introuvable.");
    }
    const take = Math.min(Math.max(Number(filters.limit || 1000), 20), 5000);
    const punches = await this.prisma.attendancePunch.findMany({
      where: {
        employeeId: id,
        punchTime: {
          gte: filters.from ? new Date(filters.from) : undefined,
          lte: filters.to ? new Date(filters.to) : undefined
        }
      },
      include: {
        shift: {
          select: {
            id: true,
            code: true,
            name: true,
            startTime: true,
            endTime: true,
            spansMidnight: true
          }
        }
      },
      orderBy: { punchTime: "desc" },
      take
    });

    return punches.map(punch => ({
      id: punch.id,
      punchTime: punch.punchTime,
      punchDate: dateKey(punch.punchTime),
      punchHour: timeKey(punch.punchTime),
      direction: punch.direction,
      shiftDate: punch.shiftDate ? dateKey(punch.shiftDate) : null,
      shiftStatus: punch.shiftStatus,
      countsAsPresence: punch.countsAsPresence,
      zktecoPunchId: punch.zktecoPunchId,
      biotimeId: punch.biotimeId,
      sourceUploadedAt: punch.sourceUploadedAt,
      sourceDevice: rawString(punch.rawPayload, ["terminal_alias", "terminal_name", "device_name", "terminal_sn", "sn", "terminal"]),
      verifyMode: rawString(punch.rawPayload, ["verify_type", "verify_mode", "verify"]),
      punchType: rawString(punch.rawPayload, ["punch_state", "punch_type", "state"]),
      workCode: rawString(punch.rawPayload, ["work_code", "workcode"]),
      shift: punch.shift,
      rawPayload: punch.rawPayload
    }));
  }

  async biotimeDepartments() {
    if (!this.biotime) {
      throw new BadRequestException("Client BioTime indisponible.");
    }
    const rows = await this.biotime.listDepartments();
    const departments = rows.map(row => normalizeDepartment(row));
    const byParent = new Map<string | null, Array<ReturnType<typeof normalizeDepartment>>>();
    for (const department of departments) {
      const key = department.parentCode || null;
      byParent.set(key, [...(byParent.get(key) || []), department]);
    }

    const attach = (parentCode: string | null): any[] => (byParent.get(parentCode) || [])
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(department => ({ ...department, children: attach(department.code) }));

    return { departments, tree: attach(null) };
  }

  async getBiotimeLive(id: string, actor?: RequestUser) {
    this.ensureBioTimeClient();
    const local = await this.get(id, actor);
    const row = await this.readBioTimeEmployee(local.zktecoId);
    return {
      local,
      biotime: normalizeBioTimeEmployee(row, id)
    };
  }

  async createInBioTime(dto: BioTimeEmployeeDto, actor: RequestUser) {
    this.ensureBioTimeWriter(actor);
    const empCode = dto.empCode?.trim();
    if (!empCode) {
      throw new BadRequestException("Le numéro d'employé est obligatoire.");
    }
    if (!dto.department?.trim()) {
      throw new BadRequestException("Le département BioTime est obligatoire.");
    }

    const existing = await this.prisma.employee.findFirst({
      where: {
        OR: [
          { employeeCode: empCode },
          { biotimeCode: empCode },
          { zktecoId: empCode }
        ]
      }
    });
    if (existing) {
      throw new BadRequestException("Ce numéro d'employé existe déjà dans RH Solution.");
    }

    try {
      const payload = this.toBioTimePayload(dto, true);
      const response = await this.biotime!.createEmployee(payload);
      const employee = await this.upsertLocalFromBioTime(response, payload);
      await this.audit.record({
        userId: actor.id,
        action: "employee.create",
        entityType: "employee",
        entityId: employee.id,
        after: employee as unknown as Prisma.InputJsonValue
      });
      return this.withPresentationFields(employee);
    } catch (error) {
      throw this.bioTimeWriteError(error, "Création BioTime refusée.");
    }
  }

  async updateInBioTime(id: string, dto: BioTimeEmployeeDto, actor: RequestUser) {
    this.ensureBioTimeWriter(actor);
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Employé introuvable.");
    }

    try {
      const payload = this.toBioTimePayload(dto, false);
      const response = await this.biotime!.updateEmployee(before.zktecoId, payload);
      const updated = await this.upsertLocalFromBioTime(response, { ...before.sourcePayload as Prisma.JsonObject, ...payload, id: before.zktecoId });
      await this.audit.record({
        userId: actor.id,
        action: "employee.update",
        entityType: "employee",
        entityId: id,
        before: before as unknown as Prisma.InputJsonValue,
        after: updated as unknown as Prisma.InputJsonValue,
        metadata: { changedFields: Object.keys(payload) }
      });
      return this.withPresentationFields(updated);
    } catch (error) {
      throw this.bioTimeWriteError(error, "Modification BioTime refusée.");
    }
  }

  async uploadBiotimePhoto(id: string, file: { buffer: Buffer; originalname?: string; mimetype?: string } | undefined, actor: RequestUser) {
    this.ensureBioTimeWriter(actor);
    if (!file) {
      throw new BadRequestException("Photo manquante.");
    }
    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Employé introuvable.");
    }

    try {
      const response = await this.biotime!.uploadEmployeePhoto(before.zktecoId, file);
      const updated = await this.upsertLocalFromBioTime(response, { ...before.sourcePayload as Prisma.JsonObject, id: before.zktecoId });
      await this.audit.record({
        userId: actor.id,
        action: "employee.update_photo",
        entityType: "employee",
        entityId: id,
        before: { id, hadPhoto: Boolean(this.extractBiotimePhotoPath(before.sourcePayload)) },
        after: { id, hadPhoto: Boolean(this.extractBiotimePhotoPath(updated.sourcePayload)) }
      });
      return this.withPresentationFields(updated);
    } catch (error) {
      throw this.bioTimeWriteError(error, "Upload photo BioTime refusé.");
    }
  }

  async resignEmployee(id: string, dto: ResignEmployeeDto, actor: RequestUser) {
    this.ensureResignWriter(actor);
    const reason = dto.reason?.trim();
    if (!reason) {
      throw new BadRequestException("Le motif de démission est obligatoire.");
    }

    const before = await this.prisma.employee.findUnique({ where: { id } });
    if (!before) {
      throw new NotFoundException("Employé introuvable.");
    }
    if (before.status === "RESIGNED") {
      throw new BadRequestException("Cet employé est déjà démissionné.");
    }

    try {
      const payload = {
        employee: before.zktecoId,
        emp: before.zktecoId,
        resign_date: dto.resignDate,
        resign_type: resignTypeCode(dto.resignType),
        reason
      };
      const response = await this.biotime!.createResign(payload);
      const merged = { ...payload, ...response };
      const biotimeId = stringField(merged, ["id", "resign_id"], `manual-${before.zktecoId}-${dto.resignDate}`);
      const resignDate = bioTimeDateField(merged, ["resign_date", "date", "leaving_date"]) || new Date(dto.resignDate);

      const result = await this.prisma.$transaction(async tx => {
        const resign = await tx.resignRecord.upsert({
          where: { biotimeId },
          update: {
            employeeId: before.id,
            employeeZktecoId: before.zktecoId,
            resignDate,
            reason,
            sourceUpdatedAt: new Date(),
            sourcePayload: merged as Prisma.InputJsonValue
          },
          create: {
            biotimeId,
            employeeId: before.id,
            employeeZktecoId: before.zktecoId,
            resignDate,
            reason,
            sourceUpdatedAt: new Date(),
            sourcePayload: merged as Prisma.InputJsonValue
          }
        });

        const employee = await tx.employee.update({
          where: { id: before.id },
          data: { status: "RESIGNED", resignedAt: resignDate }
        });

        return { resign, employee };
      });

      await this.audit.record({
        userId: actor.id,
        action: "employee.resign",
        entityType: "employee",
        entityId: before.id,
        before: before as unknown as Prisma.InputJsonValue,
        after: result.employee as unknown as Prisma.InputJsonValue,
        metadata: { resignRecordId: result.resign.id, biotimeId, resignType: dto.resignType?.trim() || "Démissionner", resignTypeCode: payload.resign_type, reason }
      });

      return {
        resign: result.resign,
        employee: this.withPresentationFields(result.employee)
      };
    } catch (error) {
      throw this.bioTimeWriteError(error, "Démission BioTime refusée.");
    }
  }

  async reinstateResign(resignRecordId: string, actor: RequestUser) {
    this.ensureResignWriter(actor);
    const resign = await this.prisma.resignRecord.findUnique({
      where: { id: resignRecordId },
      include: { employee: true }
    });
    if (!resign) {
      throw new NotFoundException("Démission introuvable.");
    }

    try {
      await this.biotime!.reinstateResign(resign.biotimeId);
      const before = resign.employee || (resign.employeeZktecoId
        ? await this.prisma.employee.findUnique({ where: { zktecoId: resign.employeeZktecoId } })
        : null);
      const employee = before
        ? await this.prisma.employee.update({
          where: { id: before.id },
          data: { status: "ACTIVE", resignedAt: null }
        })
        : null;

      await this.audit.record({
        userId: actor.id,
        action: "employee.reinstate",
        entityType: "employee",
        entityId: before?.id,
        before: before as unknown as Prisma.InputJsonValue,
        after: (employee || { resignRecordId: resign.id, restoredInBioTime: true }) as unknown as Prisma.InputJsonValue,
        metadata: { resignRecordId: resign.id, biotimeId: resign.biotimeId, reason: resign.reason }
      });

      return employee ? this.withPresentationFields(employee) : { restoredInBioTime: true, resignRecordId: resign.id };
    } catch (error) {
      throw this.bioTimeWriteError(error, "Restauration BioTime refusée.");
    }
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
      biometricEnrollment: biometricEnrollment(employee.sourcePayload),
      photoProxyUrl: this.extractBiotimePhotoPath(employee.sourcePayload) ? `/api/employees/${employee.id}/photo` : null,
      photoUrl: this.resolveBrowserPhotoUrl(employee.sourcePayload)
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
    const rawPhoto = payload.employee_photo || payload.photo || payload.avatar || payload.image || payload.profile_photo;
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

  private ensureBioTimeClient() {
    if (!this.biotime) {
      throw new BadRequestException("Client BioTime indisponible.");
    }
  }

  private ensureBioTimeWriter(actor: RequestUser) {
    this.ensureBioTimeClient();
    const roles = new Set(actor.roles || []);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.GRH)) {
      throw new ForbiddenException("Seuls Admin, DRH et GRH peuvent créer ou modifier un employé BioTime.");
    }
  }

  private ensureResignWriter(actor: RequestUser) {
    this.ensureBioTimeClient();
    const roles = new Set(actor.roles || []);
    if (!roles.has(RoleCode.Admin) && !roles.has(RoleCode.DRH) && !roles.has(RoleCode.GRH)) {
      throw new ForbiddenException("Seuls Admin, DRH et GRH peuvent gérer les démissions BioTime.");
    }
  }

  private async readBioTimeEmployee(zktecoId: string) {
    try {
      return await this.biotime!.getEmployee(zktecoId);
    } catch (error) {
      throw this.bioTimeWriteError(error, "Lecture live BioTime impossible.");
    }
  }

  private toBioTimePayload(dto: BioTimeEmployeeDto, creating: boolean) {
    const payload: BioTimeRecord = {};
    const assign = (target: string, value: unknown) => {
      if (value === undefined) return;
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed) payload[target] = trimmed;
        return;
      }
      if (value !== null) payload[target] = value as string | number | boolean;
    };

    if (creating) assign("emp_code", dto.empCode);
    assign("first_name", dto.firstName);
    assign("last_name", dto.lastName);
    assign("department", dto.department);
    assign("position", dto.position);
    assign("employment_type", dto.employmentType);
    assign("hire_date", dto.hireDate);
    assign("area", dto.area);
    assign("superior", dto.superior);
    assign("workflow_role", dto.workflowRole);
    assign("local_name", dto.localName);
    assign("gender", dto.gender);
    assign("birthday", dto.birthday);
    assign("contact_tel", dto.contactTel);
    assign("office_tel", dto.officeTel);
    assign("mobile", dto.mobile);
    assign("national", dto.national);
    assign("city", dto.city);
    assign("address", dto.address);
    assign("postcode", dto.postcode);
    assign("email", dto.email);
    return payload;
  }

  private async upsertLocalFromBioTime(row: BioTimeRecord, fallback: BioTimeRecord = {}) {
    const merged = { ...fallback, ...row };
    const zktecoId = stringField(merged, ["id", "employee_id", "pk"], stringField(fallback, ["id", "employee_id", "pk", "emp_code"]));
    const code = stringField(merged, ["emp_code", "employee_code", "code"], zktecoId);
    if (!zktecoId || !code) {
      throw new BadRequestException("Réponse BioTime incomplète: identifiant ou matricule manquant.");
    }

    return this.prisma.employee.upsert({
      where: { zktecoId },
      update: {
        biotimeCode: stringField(merged, ["biotime_code", "code"]) || null,
        employeeCode: code,
        fullName: employeeName(merged),
        department: departmentName(merged) || null,
        phone: stringField(merged, ["mobile", "phone", "telephone", "contact_tel"]) || null,
        hireDate: bioTimeDateField(merged, ["hire_date", "employment_date"]),
        sourceUpdatedAt: bioTimeDateField(merged, ["update_time", "updated_time", "last_update"]) || new Date(),
        sourcePayload: merged as Prisma.InputJsonValue,
        status: "ACTIVE",
        resignedAt: null
      },
      create: {
        zktecoId,
        biotimeCode: stringField(merged, ["biotime_code", "code"]) || null,
        employeeCode: code,
        fullName: employeeName(merged),
        department: departmentName(merged) || null,
        phone: stringField(merged, ["mobile", "phone", "telephone", "contact_tel"]) || null,
        hireDate: bioTimeDateField(merged, ["hire_date", "employment_date"]),
        sourceUpdatedAt: bioTimeDateField(merged, ["update_time", "updated_time", "last_update"]) || new Date(),
        sourcePayload: merged as Prisma.InputJsonValue,
        status: "ACTIVE"
      }
    });
  }

  private bioTimeWriteError(error: unknown, fallback: string) {
    if (axios.isAxiosError(error)) {
      const details = error.response?.data;
      const message = typeof details === "string"
        ? details
        : details && typeof details === "object"
          ? JSON.stringify(details)
          : error.message;
      return new BadRequestException(`${fallback} ${message}`);
    }
    return new BadRequestException(error instanceof Error ? `${fallback} ${error.message}` : fallback);
  }
}

function normalizeBioTimeEmployee(row: BioTimeRecord, localId?: string) {
  return {
    id: stringField(row, ["id", "employee_id", "pk"]),
    localId,
    empCode: stringField(row, ["emp_code", "employee_code", "code"]),
    firstName: stringField(row, ["first_name", "firstname"]),
    lastName: stringField(row, ["last_name", "lastname"]),
    fullName: employeeName(row),
    department: nestedStringField(row, ["department", "dept"], ["id", "dept_code", "code"]) || stringField(row, ["department_id", "dept_id"]),
    departmentName: departmentName(row),
    position: stringField(row, ["position", "position_name"]),
    employmentType: stringField(row, ["employment_type", "emp_type"]),
    hireDate: dateInputValue(row, ["hire_date", "employment_date"]),
    area: stringField(row, ["area", "area_name"]),
    superior: stringField(row, ["superior", "superior_id"]),
    workflowRole: stringField(row, ["workflow_role", "workflowrole"]),
    localName: stringField(row, ["local_name", "nickname"]),
    gender: stringField(row, ["gender"]),
    birthday: dateInputValue(row, ["birthday", "birth_date"]),
    contactTel: stringField(row, ["contact_tel", "phone", "telephone"]),
    officeTel: stringField(row, ["office_tel", "office_phone"]),
    mobile: stringField(row, ["mobile"]),
    national: stringField(row, ["national", "nationality"]),
    city: stringField(row, ["city"]),
    address: stringField(row, ["address"]),
    postcode: stringField(row, ["postcode", "zip_code"]),
    email: stringField(row, ["email"]),
    photo: stringField(row, ["employee_photo", "photo", "avatar", "image", "profile_photo"]),
    raw: row
  };
}

function normalizeDepartment(row: BioTimeRecord) {
  const code = stringField(row, ["id", "dept_code", "code", "department_code"], "");
  return {
    code,
    name: stringField(row, ["dept_name", "name", "department_name"], code),
    parentCode: nestedStringField(row, ["parent_dept", "parent", "parent_department"], ["id", "dept_code", "code"]) || stringField(row, ["parent_id", "parent_code"]) || null,
    raw: row
  };
}

function employeeName(row: BioTimeRecord) {
  const first = stringField(row, ["first_name", "firstname"]);
  const last = stringField(row, ["last_name", "lastname"]);
  const full = stringField(row, ["full_name", "name"]);
  return full || [first, last].filter(Boolean).join(" ").trim() || stringField(row, ["emp_code", "employee_code", "code"], "Employé BioTime");
}

function departmentName(row: BioTimeRecord) {
  return nestedStringField(row, ["department", "dept"], ["dept_name", "name"]) || stringField(row, ["department_name", "dept_name"]);
}

function stringField(row: BioTimeRecord, keys: string[], fallback = "") {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "object") continue;
    const stringValue = String(value).trim();
    if (stringValue && stringValue !== "-") return stringValue;
  }
  return fallback;
}

function nestedStringField(row: BioTimeRecord, parents: string[], keys: string[]) {
  for (const parent of parents) {
    const value = row[parent];
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const nested = stringField(value as BioTimeRecord, keys);
    if (nested) return nested;
  }
  return "";
}

function dateInputValue(row: BioTimeRecord, keys: string[]) {
  const raw = stringField(row, keys);
  if (!raw) return "";
  const slashDate = /^(\d{2})\/(\d{2})\/(\d{4})/.exec(raw);
  if (slashDate) {
    const [, day, month, year] = slashDate;
    return `${year}-${month}-${day}`;
  }
  const parsed = bioTimeDateField(row, keys);
  if (!parsed) return "";
  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, "0");
  const day = String(parsed.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function rawString(payload: Prisma.JsonValue | null | undefined, keys: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of keys) {
    const value = record[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "object") {
      const nestedName = stringField(value as BioTimeRecord, ["alias", "name", "terminal_name", "sn"]);
      if (nestedName) return nestedName;
      continue;
    }
    const text = String(value).trim();
    if (text && text !== "-") return text;
  }
  return null;
}

function biometricEnrollment(payload?: Prisma.JsonValue | null) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return { fingerprint: false, face: false, palm: false, visibleLightFace: false, visibleLightPalm: false };
  }
  const row = payload as BioTimeRecord;
  return {
    fingerprint: hasBiometricValue(row, ["fingerprint", "finger_print", "fp_count", "template_count", "fingerprint_count"]),
    face: hasBiometricValue(row, ["face", "face_count", "face_template", "face_template_count"]),
    palm: hasBiometricValue(row, ["palm", "palm_count", "palm_template"]),
    visibleLightFace: hasBiometricValue(row, ["vl_face", "visible_light_face", "visiblelight_face"]),
    visibleLightPalm: hasBiometricValue(row, ["vl_palm", "visible_light_palm", "visiblelight_palm"])
  };
}

function hasBiometricValue(row: BioTimeRecord, keys: string[]) {
  for (const key of keys) {
    const value = row[key];
    if (value === null || value === undefined) continue;
    if (typeof value === "number") return value > 0;
    if (typeof value === "boolean") return value;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value).length > 0;
    const text = String(value).trim().toLowerCase();
    if (text && !["-", "0", "false", "none", "null", "no", "non"].includes(text)) return true;
  }
  return false;
}

function resignTypeLabel(payload?: Prisma.JsonValue | null) {
  const raw = rawString(payload, ["resign_type", "type", "resignation_type", "leaving_type", "resign_reason_type"]);
  if (!raw) return null;
  const labels: Record<string, string> = {
    "1": "Quitter",
    "2": "Renvoyer",
    "3": "Démissionner",
    "4": "Transfert",
    "5": "Maintien sans salaire"
  };
  return labels[raw] || raw;
}

function resignTypeCode(value?: string | null) {
  const raw = value?.trim() || "Démissionner";
  if (/^\d+$/.test(raw)) return raw;
  const normalized = raw.toLowerCase();
  const codes: Record<string, string> = {
    "quitter": "1",
    "quit": "1",
    "renvoyer": "2",
    "terminated": "2",
    "licenciement": "2",
    "démissionner": "3",
    "demissionner": "3",
    "démission": "3",
    "demission": "3",
    "resigned": "3",
    "transfert": "4",
    "transfer": "4",
    "maintien sans salaire": "5",
    "retain job without salary": "5"
  };
  return codes[normalized] || raw;
}

function resignEmployeePayloadString(payload: Prisma.JsonValue | null | undefined, keys: string[]) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return null;
  const employee = (payload as BioTimeRecord).employee;
  if (!employee || typeof employee !== "object" || Array.isArray(employee)) return null;
  return rawString(employee as Prisma.JsonValue, keys);
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function timeKey(date: Date) {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:${String(date.getSeconds()).padStart(2, "0")}`;
}
