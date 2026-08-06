import { Injectable, NotFoundException } from "@nestjs/common";
import { EmployeeMappingMethod, EmployeeMappingStatus, Prisma } from "@prisma/client";
import { AuditService } from "../audit/audit.service";
import { RequestUser } from "../common/request-user.type";
import { PrismaService } from "../prisma/prisma.service";
import { extractSapCompany, isPhoneSearch, nameMatches, nameSearchScore, normalizeName, normalizePhone, phoneMatches, similarityScore, toSapCandidate } from "./sap-normalization";
import { SapDirectoryCacheService } from "./sap-directory-cache.service";
import { MatchResult, SapCandidate } from "./sap.types";

@Injectable()
export class SapMatchingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly directoryCache: SapDirectoryCacheService,
    private readonly audit: AuditService
  ) {}

  async sapDirectory(search = "") {
    const rows = await this.directoryCache.getAll();
    const query = normalizeName(search);
    const phone = normalizePhone(search);
    const canSearchPhone = isPhoneSearch(search);
    const rawSearch = search.trim().toLowerCase();
    const numericSearch = rawSearch.replace(/\D/g, "");

    if (!query && !phone) {
      return rows.slice(0, 100);
    }

    return rows
      .map(row => {
        const empId = row.empID.toLowerCase();
        const empIdSuffix = empId.split("-").pop()?.replace(/\D/g, "") || "";
        const exactEmpId = Boolean(rawSearch && empId === rawSearch);
        const prefixEmpId = Boolean(rawSearch && empId.startsWith(rawSearch));
        const containsEmpId = Boolean(rawSearch && empId.includes(rawSearch));
        const exactNumericEmpId = Boolean(numericSearch && empIdSuffix === numericSearch);
        const prefixNumericEmpId = Boolean(numericSearch && empIdSuffix.startsWith(numericSearch));
        const companyMatch = Boolean(rawSearch && row.company.toLowerCase().includes(rawSearch));
        const positionMatch = Boolean(query && normalizeName(row.Poste).includes(query));
        const structureMatch = Boolean(query && normalizeName(row.Structure).includes(query));
        const nameScore = nameSearchScore(search, row.sapFullName);
        const nameMatch = nameScore > 0;
        const phoneMatch = Boolean(canSearchPhone && phone && row.normalizedPhone.includes(phone));

        return {
          row,
          exactEmpId,
          prefixEmpId,
          containsEmpId,
          exactNumericEmpId,
          prefixNumericEmpId,
          companyMatch,
          positionMatch,
          structureMatch,
          nameScore,
          nameMatch,
          phoneMatch
        };
      })
      .filter(result => result.exactEmpId || result.prefixEmpId || result.containsEmpId || result.exactNumericEmpId || result.prefixNumericEmpId || result.companyMatch || result.positionMatch || result.structureMatch || result.nameMatch || result.phoneMatch)
      .sort((left, right) => this.sapDirectoryRank(right) - this.sapDirectoryRank(left))
      .map(result => result.row)
      .slice(0, 200);
  }

  cacheStatus() {
    return this.directoryCache.status();
  }

  async refreshCache() {
    await this.directoryCache.refresh();
    return this.directoryCache.status();
  }

  async runAutoMatching(actor?: RequestUser) {
    const [employees, sapEmployees] = await Promise.all([
      this.unconfirmedEmployees(),
      this.directoryCache.getAll()
    ]);
    const candidates = sapEmployees;
    let confirmed = 0;
    let pending = 0;

    for (const employee of employees) {
      const best = this.bestCandidate(employee.fullName, employee.phone, candidates);
      if (!best || best.score === 0) continue;

      if (best.nameMatches && best.phoneMatches) {
        await this.upsertMapping(employee.id, best.sap, EmployeeMappingMethod.auto_name_phone, EmployeeMappingStatus.confirmed, best.score);
        await this.applyConfirmedMatricule(employee.id, best.sap);
        confirmed += 1;
      } else {
        await this.upsertMapping(employee.id, best.sap, EmployeeMappingMethod.auto_partial, EmployeeMappingStatus.pending_review, best.score, {
          nameMatches: best.nameMatches,
          phoneMatches: best.phoneMatches
        });
        pending += 1;
      }
    }

    await this.audit.record({
      userId: actor?.id,
      action: "sap_matching.auto_run",
      entityType: "employee_mapping",
      metadata: { confirmed, pending }
    });

    return { confirmed, pending };
  }

  async queue() {
    const employees = await this.unconfirmedEmployees();
    const candidates = await this.directoryCache.getAll();
    const pendingMappings = await this.prisma.employeeMapping.findMany({
      where: { status: EmployeeMappingStatus.pending_review },
      include: { employee: true },
      orderBy: { matchedAt: "desc" }
    });
    const pendingIds = new Set(pendingMappings.map(mapping => mapping.biotimeEmployeeId));
    const unmapped = employees.filter(employee => !pendingIds.has(employee.id));

    return {
      pending: pendingMappings.map(mapping => ({
        employee: mapping.employee,
        mapping,
        suggestions: [{
          empID: mapping.sapEmpId,
          company: extractSapCompany(mapping.sapEmpId),
          sapFullName: mapping.sapFullName,
          mobile: mapping.sapMobile,
          Poste: (mapping.metadata as { Poste?: string } | null)?.Poste || null,
          Structure: (mapping.metadata as { Structure?: string } | null)?.Structure || null,
          score: mapping.confidenceScore,
          nameMatches: Boolean((mapping.metadata as { nameMatches?: boolean } | null)?.nameMatches),
          phoneMatches: Boolean((mapping.metadata as { phoneMatches?: boolean } | null)?.phoneMatches)
        }]
      })),
      unmapped: unmapped.map(employee => ({
        employee,
        suggestions: this.bestCandidates(employee.fullName, employee.phone, candidates)
          .slice(0, 3)
          .map(result => this.toSuggestion(result))
      }))
    };
  }

  async allMappings(filters: { search?: string; company?: string; status?: string }) {
    const employees = await this.prisma.employee.findMany({
      include: {
        sapMappings: {
          orderBy: [{ status: "asc" }, { matchedAt: "desc" }],
          include: { matchedBy: { select: { id: true, username: true, fullName: true } } }
        }
      },
      orderBy: { fullName: "asc" }
    });
    const search = normalizeName(filters.search || "");
    const rawSearch = (filters.search || "").toLowerCase().trim();
    const company = (filters.company || "").toUpperCase();
    const status = filters.status || "";

    return employees
      .map(employee => {
        const current = this.currentMapping(employee.sapMappings);
        return {
          employee,
          mapping: current,
          mappingStatus: current?.status || "unmapped",
          sapCompany: current ? extractSapCompany(current.sapEmpId) : null,
          sapPoste: (current?.metadata as { Poste?: string } | null)?.Poste || null,
          sapStructure: (current?.metadata as { Structure?: string } | null)?.Structure || null
        };
      })
      .filter(row => !status || row.mappingStatus === status)
      .filter(row => !company || row.sapCompany === company)
      .filter(row => {
        if (!search && !rawSearch) return true;
        const haystack = normalizeName(`${row.employee.fullName} ${row.mapping?.sapFullName || ""} ${row.sapCompany || ""}`);
        return haystack.includes(search) || (row.mapping?.sapEmpId || "").toLowerCase().includes(rawSearch);
      });
  }

  async confirm(employeeId: string, sapEmpId: string | undefined, actor: RequestUser) {
    const candidate = await this.findSapCandidateOrPending(employeeId, sapEmpId);
    const mapping = await this.upsertMapping(employeeId, candidate, EmployeeMappingMethod.manual, EmployeeMappingStatus.confirmed, 1, undefined, actor.id);
    const employee = await this.applyConfirmedMatricule(employeeId, candidate);

    await this.audit.record({
      userId: actor.id,
      action: "sap_matching.confirm",
      entityType: "employee_mapping",
      entityId: mapping.id,
      after: { mapping, localMatricule: employee.localMatricule }
    });

    return mapping;
  }

  async reject(employeeId: string, sapEmpId: string, actor: RequestUser) {
    const mapping = await this.prisma.employeeMapping.update({
      where: { biotimeEmployeeId_sapEmpId: { biotimeEmployeeId: employeeId, sapEmpId } },
      data: {
        status: EmployeeMappingStatus.rejected,
        matchedById: actor.id,
        matchedAt: new Date()
      }
    });

    await this.audit.record({
      userId: actor.id,
      action: "sap_matching.reject",
      entityType: "employee_mapping",
      entityId: mapping.id,
      after: mapping
    });

    return mapping;
  }

  async relink(employeeId: string, sapEmpId: string, actor: RequestUser) {
    const candidate = await this.findSapCandidateOrPending(employeeId, sapEmpId);
    const existingConfirmed = await this.prisma.employeeMapping.findMany({
      where: { biotimeEmployeeId: employeeId, status: EmployeeMappingStatus.confirmed }
    });

    const mapping = await this.prisma.$transaction(async tx => {
      for (const existing of existingConfirmed) {
        await tx.employeeMapping.update({
          where: { id: existing.id },
          data: {
            status: EmployeeMappingStatus.rejected,
            matchedById: actor.id,
            matchedAt: new Date()
          }
        });
      }

      const next = await tx.employeeMapping.upsert({
        where: { biotimeEmployeeId_sapEmpId: { biotimeEmployeeId: employeeId, sapEmpId: candidate.empID } },
        update: {
          sapFullName: candidate.sapFullName,
          sapMobile: candidate.mobile || null,
          matchMethod: EmployeeMappingMethod.manual,
          confidenceScore: 1,
          status: EmployeeMappingStatus.confirmed,
          matchedById: actor.id,
          matchedAt: new Date(),
          metadata: this.sapMetadata(candidate)
        },
        create: {
          biotimeEmployeeId: employeeId,
          sapEmpId: candidate.empID,
          sapFullName: candidate.sapFullName,
          sapMobile: candidate.mobile || null,
          matchMethod: EmployeeMappingMethod.manual,
          confidenceScore: 1,
          status: EmployeeMappingStatus.confirmed,
          matchedById: actor.id,
          metadata: this.sapMetadata(candidate)
        }
      });

      await tx.employee.update({
        where: { id: employeeId },
        data: { localMatricule: this.sapMatriculeForDisplay(candidate) }
      });

      return next;
    });

    await this.audit.record({
      userId: actor.id,
      action: "sap_matching.relink",
      entityType: "employee_mapping",
      entityId: mapping.id,
      before: { rejectedMappings: existingConfirmed },
      after: { mapping, localMatricule: this.sapMatriculeForDisplay(candidate) }
    });

    return mapping;
  }

  private async unconfirmedEmployees() {
    return this.prisma.employee.findMany({
      where: {
        sapMappings: {
          none: { status: EmployeeMappingStatus.confirmed }
        }
      },
      orderBy: { fullName: "asc" }
    });
  }

  private bestCandidates(fullName: string, phone: string | null, sapCandidates: SapCandidate[]): Array<MatchResult> {
    const bioName = normalizeName(fullName);
    const bioPhone = normalizePhone(phone);
    return sapCandidates
      .map(sap => {
        const nameMatch = nameMatches(bioName, sap.normalizedName);
        const phoneMatch = phoneMatches(bioPhone, sap.normalizedPhone);
        return {
          sap,
          nameMatches: nameMatch,
          phoneMatches: phoneMatch,
          score: similarityScore(nameMatch, phoneMatch)
        };
      })
      .filter(result => result.score > 0)
      .sort((left, right) => right.score - left.score);
  }

  private bestCandidate(fullName: string, phone: string | null, sapCandidates: SapCandidate[]) {
    return this.bestCandidates(fullName, phone, sapCandidates)[0] || null;
  }

  private async findSapCandidateOrPending(employeeId: string, sapEmpId?: string) {
    if (sapEmpId) {
      const candidate = await this.directoryCache.findExactByEmpId(sapEmpId);
      if (!candidate) throw new NotFoundException("Employé SAP introuvable.");
      return candidate;
    }

    const pending = await this.prisma.employeeMapping.findFirst({
      where: { biotimeEmployeeId: employeeId, status: EmployeeMappingStatus.pending_review },
      orderBy: { confidenceScore: "desc" }
    });
    if (!pending) throw new NotFoundException("Aucun rapprochement SAP en attente pour cet employé.");
    return toSapCandidate({
      empID: pending.sapEmpId,
      biotimeId: null,
      Nom: pending.sapFullName,
      Prenom: null,
      Poste: null,
      Structure: null,
      Date_Entrer: null,
      mobile: pending.sapMobile
    });
  }

  private async upsertMapping(
    employeeId: string,
    sap: SapCandidate,
    method: EmployeeMappingMethod,
    status: EmployeeMappingStatus,
    score: number,
    metadata?: Prisma.InputJsonValue,
    matchedById?: string
  ) {
    return this.prisma.employeeMapping.upsert({
      where: { biotimeEmployeeId_sapEmpId: { biotimeEmployeeId: employeeId, sapEmpId: sap.empID } },
      update: {
        sapFullName: sap.sapFullName,
        sapMobile: sap.mobile || null,
        matchMethod: method,
        confidenceScore: score,
        status,
        matchedById: matchedById || null,
        matchedAt: new Date(),
        metadata: this.mappingMetadata(sap, metadata)
      },
      create: {
        biotimeEmployeeId: employeeId,
        sapEmpId: sap.empID,
        sapFullName: sap.sapFullName,
        sapMobile: sap.mobile || null,
        matchMethod: method,
        confidenceScore: score,
        status,
        matchedById: matchedById || null,
        metadata: this.mappingMetadata(sap, metadata)
      }
    });
  }

  private async applyConfirmedMatricule(employeeId: string, sap: SapCandidate) {
    return this.prisma.employee.update({
      where: { id: employeeId },
      data: { localMatricule: this.sapMatriculeForDisplay(sap) }
    });
  }

  private sapMatriculeForDisplay(sap: SapCandidate) {
    return sap.empID;
  }

  private sapMetadata(sap: SapCandidate): Prisma.InputJsonObject {
    return {
      company: sap.company,
      Poste: sap.Poste,
      Structure: sap.Structure,
      Date_Entrer: sap.Date_Entrer ? String(sap.Date_Entrer) : null
    };
  }

  private mappingMetadata(sap: SapCandidate, metadata?: Prisma.InputJsonValue): Prisma.InputJsonObject {
    const extra = metadata && typeof metadata === "object" && !Array.isArray(metadata)
      ? metadata as Prisma.InputJsonObject
      : {};

    return {
      ...this.sapMetadata(sap),
      ...extra
    };
  }

  private toSuggestion(result: MatchResult) {
    return {
      empID: result.sap.empID,
      company: result.sap.company,
      sapFullName: result.sap.sapFullName,
      mobile: result.sap.mobile || null,
      Poste: result.sap.Poste || null,
      Structure: result.sap.Structure || null,
      score: result.score,
      nameMatches: result.nameMatches,
      phoneMatches: result.phoneMatches
    };
  }

  private currentMapping<T extends { status: EmployeeMappingStatus; matchedAt: Date }>(mappings: T[]): T | null {
    return mappings.find(mapping => mapping.status === EmployeeMappingStatus.confirmed)
      || mappings.find(mapping => mapping.status === EmployeeMappingStatus.pending_review)
      || mappings.find(mapping => mapping.status === EmployeeMappingStatus.rejected)
      || null;
  }

  private sapDirectoryRank(result: {
    exactEmpId: boolean;
    prefixEmpId: boolean;
    containsEmpId: boolean;
    exactNumericEmpId: boolean;
    prefixNumericEmpId: boolean;
    companyMatch: boolean;
    positionMatch: boolean;
    structureMatch: boolean;
    nameScore: number;
    nameMatch: boolean;
    phoneMatch: boolean;
  }) {
    if (result.exactEmpId) return 1000;
    if (result.exactNumericEmpId) return 950;
    if (result.prefixEmpId) return 900;
    if (result.prefixNumericEmpId) return 850;
    if (result.containsEmpId) return 800;
    if (result.nameMatch && result.phoneMatch) return 700 + result.nameScore;
    if (result.nameMatch) return 500 + result.nameScore;
    if (result.phoneMatch) return 300;
    if (result.companyMatch) return 200;
    if (result.structureMatch) return 150;
    if (result.positionMatch) return 100;
    return 0;
  }
}
