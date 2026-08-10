import { Injectable } from "@nestjs/common";
import { ALL_PERMISSIONS, PermissionCode } from "../permissions/permission-codes";
import { PrismaService } from "../prisma/prisma.service";
import { DEFAULT_ROLES } from "../roles/default-roles";

const ADMINISTRATION_MODULES = [
  { code: "dashboard", label: "Tableau de bord", path: "/", permission: PermissionCode.ReportsRead, group: "pilotage" },
  { code: "realtime", label: "Temps réel", path: "/realtime", permission: PermissionCode.AttendanceRead, group: "presence" },
  { code: "absences", label: "Absences", path: "/absences", permission: PermissionCode.ReportsRead, group: "presence" },
  { code: "employees", label: "Employés", path: "/employees", permission: PermissionCode.EmployeesRead, group: "rh" },
  { code: "org", label: "Organigramme", path: "/org", permission: PermissionCode.OrgRead, group: "rh" },
  { code: "devices", label: "Terminaux", path: "/devices", permission: PermissionCode.DevicesRead, group: "system" },
  { code: "reports", label: "Rapports", path: "/reports", permission: PermissionCode.ReportsRead, group: "pilotage" },
  { code: "sync", label: "Synchronisation", path: "/admin/sync", permission: PermissionCode.SyncRun, group: "system" },
  { code: "sap-directory", label: "Annuaire SAP", path: "/admin/sap-directory", permission: PermissionCode.EmployeesManage, group: "rh" },
  { code: "administration", label: "Administration", path: "/admin/users", permission: PermissionCode.AdministrationRead, group: "system" }
] as const;

@Injectable()
export class AdministrationService {
  constructor(private readonly prisma: PrismaService) {}

  async overview() {
    const [users, roles, permissions, units] = await Promise.all([
      this.prisma.user.findMany({
        orderBy: { createdAt: "desc" },
        include: {
          roles: { include: { role: true } },
          subUnitAccess: { include: { subUnit: { include: { unit: true } } } }
        }
      }),
      this.prisma.role.findMany({
        orderBy: { code: "asc" },
        include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } }
      }),
      this.prisma.permission.findMany({
        orderBy: [{ module: "asc" }, { action: "asc" }]
      }),
      this.prisma.unit.findMany({
        orderBy: { name: "asc" },
        include: { subUnits: { orderBy: { name: "asc" } } }
      })
    ]);

    return {
      users: users.map(user => ({
        id: user.id,
        username: user.username,
        email: user.email,
        fullName: user.fullName,
        isActive: user.isActive,
        roles: user.roles.map(item => ({ code: item.role.code, name: item.role.name })),
        orgAccess: user.subUnitAccess.map(item => ({
          subUnitId: item.subUnitId,
          subUnitName: item.subUnit.name,
          unitId: item.subUnit.unitId,
          unitName: item.subUnit.unit.name
        }))
      })),
      roles: roles.map(role => ({
        id: role.id,
        code: role.code,
        name: role.name,
        description: role.description,
        userCount: role._count.users,
        permissions: role.permissions.map(item => item.permission.code).sort()
      })),
      permissions,
      modules: ADMINISTRATION_MODULES,
      orgUnits: units.map(unit => ({
        id: unit.id,
        name: unit.name,
        code: unit.code,
        subUnits: unit.subUnits.map(subUnit => ({ id: subUnit.id, name: subUnit.name, biotimeDepartmentCode: (subUnit as any).biotimeDepartmentCode || null }))
      }))
    };
  }

  async seedDefaults() {
    for (const permission of ALL_PERMISSIONS) {
      await this.prisma.permission.upsert({
        where: { code: permission.code },
        update: {
          module: permission.module,
          action: permission.action,
          description: permission.description
        },
        create: permission
      });
    }

    for (const role of DEFAULT_ROLES) {
      const savedRole = await this.prisma.role.upsert({
        where: { code: role.code },
        update: {
          name: role.name,
          description: role.description
        },
        create: {
          code: role.code,
          name: role.name,
          description: role.description
        }
      });

      const permissions = await this.prisma.permission.findMany({
        where: { code: { in: [...role.permissions] } }
      });

      await this.prisma.rolePermission.deleteMany({ where: { roleId: savedRole.id } });
      await this.prisma.rolePermission.createMany({
        data: permissions.map(permission => ({
          roleId: savedRole.id,
          permissionId: permission.id
        })),
        skipDuplicates: true
      });
    }

    return { ok: true, roles: DEFAULT_ROLES.length, permissions: ALL_PERMISSIONS.length };
  }
}
