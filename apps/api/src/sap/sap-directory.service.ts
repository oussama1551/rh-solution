import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { extractSapCompany, nameSearchScore, normalizeName, normalizePhone, phoneMatches } from "./sap-normalization";
import { SapDirectoryCacheService } from "./sap-directory-cache.service";
import { PrismaService } from "../prisma/prisma.service";
import { SapCandidate } from "./sap.types";
import { RequestUser } from "../common/request-user.type";
import { SyncService } from "../sync/sync.service";

@Injectable()
export class SapDirectoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cache: SapDirectoryCacheService,
    private readonly sync: SyncService
  ) {}

  async list(filters: { search?: string; company?: string; linked?: string }) {
    const search = normalizeName(filters.search || "");
    const rawSearch = (filters.search || "").trim().toLowerCase();
    const company = (filters.company || "").trim().toUpperCase();

    const rows = await this.prisma.sapEmployeeDirectory.findMany({
      include: {
        employee: {
          select: {
            id: true,
            zktecoId: true,
            biotimeCode: true,
            employeeCode: true,
            localMatricule: true,
            fullName: true,
            department: true,
            status: true
          }
        }
      },
      orderBy: [{ sapCompany: "asc" }, { sapEmpId: "asc" }]
    });

    return rows
      .filter(row => !company || row.sapCompany === company)
      .filter(row => {
        if (filters.linked === "linked") return Boolean(row.employeeId);
        if (filters.linked === "unlinked") return !row.employeeId;
        return true;
      })
      .filter(row => {
        if (!search && !rawSearch) return true;
        const haystack = normalizeName(`${row.fullName} ${row.poste || ""} ${row.structure || ""} ${row.sapCompany}`);
        return haystack.includes(search)
          || row.sapEmpId.toLowerCase().includes(rawSearch)
          || (row.biotimeId || "").toLowerCase().includes(rawSearch)
          || (row.mobile || "").toLowerCase().includes(rawSearch);
      });
  }

  async refresh() {
    const sapEmployees = await this.cache.refresh();
    const employees = await this.prisma.employee.findMany({
      select: {
        id: true,
        zktecoId: true,
        biotimeCode: true,
        employeeCode: true,
        localMatricule: true,
        fullName: true,
        phone: true
      }
    });
    const employeeByBiotimeId = new Map<string, string>();
    for (const employee of employees) {
      [employee.zktecoId, employee.biotimeCode, employee.employeeCode, employee.localMatricule]
        .filter(Boolean)
        .forEach(value => employeeByBiotimeId.set(String(value).trim(), employee.id));
    }
    let linked = 0;
    let autoNameLinked = 0;
    let localMatriculesUpdated = 0;

    for (const sap of sapEmployees) {
      const biotimeId = sap.biotimeId?.trim() || null;
      const strictEmployeeId = (biotimeId ? employeeByBiotimeId.get(biotimeId) || null : null)
        || employeeByBiotimeId.get(sap.empID)
        || null;
      const nameEmployeeId = strictEmployeeId ? null : this.findUniqueEmployeeByNameAndPhone(sap, employees);
      const employeeId = strictEmployeeId || nameEmployeeId;
      if (employeeId) linked += 1;
      if (nameEmployeeId) autoNameLinked += 1;

      const data = this.toDirectoryData(sap, employeeId);

      await this.prisma.sapEmployeeDirectory.upsert({
        where: { sapEmpId: sap.empID },
        update: data,
        create: {
          sapEmpId: sap.empID,
          ...this.toDirectoryCreateData(sap, employeeId)
        }
      });

      if (employeeId && await this.applyLocalMatriculeIfEmpty(employeeId, sap.empID)) {
        localMatriculesUpdated += 1;
      }
    }

    return {
      total: sapEmployees.length,
      linked,
      unlinked: sapEmployees.length - linked,
      autoNameLinked,
      localMatriculesUpdated,
      cache: this.cache.status()
    };
  }

  async refreshWithBiotime(user: RequestUser) {
    const biotimeSync = await this.sync.run("manual_sap_biotime", user.id, { full: true });
    const sapSync = await this.refresh();

    return {
      ...sapSync,
      biotimeSync
    };
  }

  async listBiotime(filters: { search?: string; status?: string; sap?: string }) {
    const search = normalizeName(filters.search || "");
    const rawSearch = (filters.search || "").trim().toLowerCase();

    const employees = await this.prisma.employee.findMany({
      include: {
        sapDirectoryRecords: {
          orderBy: { lastSyncedAt: "desc" }
        }
      },
      orderBy: [{ status: "asc" }, { fullName: "asc" }]
    });

    return employees
      .filter(employee => !filters.status || employee.status === filters.status)
      .filter(employee => {
        if (filters.sap === "linked") return employee.sapDirectoryRecords.length > 0;
        if (filters.sap === "missing") return employee.sapDirectoryRecords.length === 0;
        return true;
      })
      .filter(employee => {
        if (!search && !rawSearch) return true;
        const haystack = normalizeName(`${employee.fullName} ${employee.department || ""}`);
        return haystack.includes(search)
          || employee.zktecoId.toLowerCase().includes(rawSearch)
          || (employee.biotimeCode || "").toLowerCase().includes(rawSearch)
          || employee.employeeCode.toLowerCase().includes(rawSearch)
          || (employee.localMatricule || "").toLowerCase().includes(rawSearch);
      })
      .map(employee => ({
        id: employee.id,
        zktecoId: employee.zktecoId,
        biotimeCode: employee.biotimeCode,
        localMatricule: employee.localMatricule,
        employeeCode: employee.employeeCode,
        fullName: employee.fullName,
        department: employee.department,
        phone: employee.phone,
        hireDate: employee.hireDate,
        resignedAt: employee.resignedAt,
        status: employee.status,
        sapRecords: employee.sapDirectoryRecords
      }));
  }

  async linkManually(input: { sapEmpId?: string | null; employeeId?: string | null }) {
    const sapEmpId = input.sapEmpId?.trim();
    const employeeId = input.employeeId?.trim();

    if (!sapEmpId || !employeeId) {
      throw new BadRequestException("SAP et BioTime sont obligatoires pour le lien manuel.");
    }

    const [sap, employee] = await Promise.all([
      this.prisma.sapEmployeeDirectory.findUnique({ where: { sapEmpId } }),
      this.prisma.employee.findUnique({
        where: { id: employeeId },
        select: {
          id: true,
          zktecoId: true,
          biotimeCode: true,
          employeeCode: true,
          localMatricule: true,
          fullName: true,
          department: true,
          status: true
        }
      })
    ]);

    if (!sap) throw new NotFoundException("Employé SAP introuvable.");
    if (!employee) throw new NotFoundException("Employé BioTime introuvable.");

    const biotimeId = employee.biotimeCode?.trim() || employee.employeeCode || employee.zktecoId || null;
    const updated = await this.prisma.$transaction(async tx => {
      await tx.sapEmployeeDirectory.updateMany({
        where: {
          employeeId,
          NOT: { sapEmpId }
        },
        data: { employeeId: null }
      });

      const directory = await tx.sapEmployeeDirectory.update({
        where: { sapEmpId },
        data: {
          employeeId,
          biotimeId
        },
        include: {
          employee: {
            select: {
              id: true,
              zktecoId: true,
              biotimeCode: true,
              employeeCode: true,
              localMatricule: true,
              fullName: true,
              department: true,
              status: true
            }
          }
        }
      });

      await tx.employee.update({
        where: { id: employeeId },
        data: { localMatricule: sapEmpId }
      });

      return directory;
    });

    return updated;
  }

  private toDirectoryData(sap: SapCandidate, employeeId: string | null): Prisma.SapEmployeeDirectoryUncheckedUpdateInput {
    return {
      sapCompany: sap.company || extractSapCompany(sap.empID),
      biotimeId: sap.biotimeId?.trim() || null,
      employeeId,
      lastName: sap.Nom || null,
      firstName: sap.Prenom || null,
      fullName: sap.sapFullName || [sap.Nom, sap.Prenom].filter(Boolean).join(" ").trim() || sap.empID,
      poste: sap.Poste || null,
      structure: sap.Structure || null,
      hireDate: sap.Date_Entrer ? new Date(sap.Date_Entrer) : null,
      mobile: sap.mobile || null,
      rawPayload: sap as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date()
    };
  }

  private toDirectoryCreateData(sap: SapCandidate, employeeId: string | null): Omit<Prisma.SapEmployeeDirectoryUncheckedCreateInput, "sapEmpId"> {
    return {
      sapCompany: sap.company || extractSapCompany(sap.empID),
      biotimeId: sap.biotimeId?.trim() || null,
      employeeId,
      lastName: sap.Nom || null,
      firstName: sap.Prenom || null,
      fullName: sap.sapFullName || [sap.Nom, sap.Prenom].filter(Boolean).join(" ").trim() || sap.empID,
      poste: sap.Poste || null,
      structure: sap.Structure || null,
      hireDate: sap.Date_Entrer ? new Date(sap.Date_Entrer) : null,
      mobile: sap.mobile || null,
      rawPayload: sap as unknown as Prisma.InputJsonValue,
      lastSyncedAt: new Date()
    };
  }

  private findUniqueEmployeeByNameAndPhone(
    sap: SapCandidate,
    employees: Array<{ id: string; fullName: string; phone: string | null }>
  ) {
    const sapPhone = normalizePhone(sap.mobile);
    const matches = employees
      .map(employee => {
        const nameScore = nameSearchScore(sap.sapFullName, employee.fullName);
        const phoneMatch = phoneMatches(sapPhone, normalizePhone(employee.phone));
        return { employee, nameScore, phoneMatch };
      })
      .filter(result => {
        if (result.phoneMatch && result.nameScore > 0) return true;
        return result.nameScore >= 92;
      })
      .sort((left, right) => {
        if (left.phoneMatch !== right.phoneMatch) return left.phoneMatch ? -1 : 1;
        return right.nameScore - left.nameScore;
      });

    if (!matches.length) return null;
    const [best, second] = matches;
    if (second && second.phoneMatch === best.phoneMatch && second.nameScore === best.nameScore) return null;
    return best.employee.id;
  }

  private async applyLocalMatriculeIfEmpty(employeeId: string, sapEmpId: string) {
    const result = await this.prisma.employee.updateMany({
      where: {
        id: employeeId,
        OR: [{ localMatricule: null }, { localMatricule: "" }]
      },
      data: { localMatricule: sapEmpId }
    });
    return result.count > 0;
  }

}
