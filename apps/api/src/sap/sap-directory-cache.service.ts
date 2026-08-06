import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { toSapCandidate } from "./sap-normalization";
import { SapHanaClientService } from "./sap-client.service";
import { SapCandidate } from "./sap.types";

@Injectable()
export class SapDirectoryCacheService {
  private employees: SapCandidate[] = [];
  private refreshedAt: Date | null = null;
  private refreshPromise: Promise<SapCandidate[]> | null = null;

  constructor(
    private readonly sap: SapHanaClientService,
    private readonly config: ConfigService
  ) {}

  async getAll() {
    if (!this.isExpired() && this.employees.length > 0) {
      return this.employees;
    }

    return this.refresh();
  }

  async refresh() {
    if (this.refreshPromise) {
      return this.refreshPromise;
    }

    this.refreshPromise = this.sap.listEmployees()
      .then(rows => {
        this.employees = rows.map(toSapCandidate);
        this.refreshedAt = new Date();
        return this.employees;
      })
      .finally(() => {
        this.refreshPromise = null;
      });

    return this.refreshPromise;
  }

  async findExactByEmpId(empId: string) {
    const normalized = empId.trim().toLowerCase();
    if (!normalized) return null;

    const employees = await this.getAll();
    return employees.find(employee => employee.empID.toLowerCase() === normalized) || null;
  }

  status() {
    return {
      loaded: this.employees.length > 0,
      employeeCount: this.employees.length,
      refreshedAt: this.refreshedAt?.toISOString() || null,
      ttlMinutes: this.ttlMinutes(),
      expiresAt: this.refreshedAt
        ? new Date(this.refreshedAt.getTime() + this.ttlMinutes() * 60_000).toISOString()
        : null
    };
  }

  private isExpired() {
    if (!this.refreshedAt) return true;
    return Date.now() - this.refreshedAt.getTime() >= this.ttlMinutes() * 60_000;
  }

  private ttlMinutes() {
    return Number(this.config.get("SAP_DIRECTORY_CACHE_TTL_MINUTES") || 15);
  }
}
