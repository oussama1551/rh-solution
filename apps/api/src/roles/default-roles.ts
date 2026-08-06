import { PermissionCode } from "../permissions/permission-codes";
import { RoleCode } from "./role-codes";

export const DEFAULT_ROLES = [
  {
    code: RoleCode.Admin,
    name: "Administrateur",
    description: "Accès complet à toute l'application",
    permissions: Object.values(PermissionCode)
  },
  {
    code: RoleCode.IT,
    name: "IT",
    description: "Administration technique, comptes, synchronisation et audit",
    permissions: [
      PermissionCode.AdministrationRead,
      PermissionCode.AdministrationManage,
      PermissionCode.UsersRead,
      PermissionCode.UsersManage,
      PermissionCode.RolesRead,
      PermissionCode.RolesManage,
      PermissionCode.DevicesRead,
      PermissionCode.SyncRun,
      PermissionCode.AuditRead,
      PermissionCode.ReportsRead
    ]
  },
  {
    code: RoleCode.DRH,
    name: "DRH",
    description: "Direction RH avec pilotage complet des données RH",
    permissions: [
      PermissionCode.UsersRead,
      PermissionCode.RolesRead,
      PermissionCode.EmployeesRead,
      PermissionCode.EmployeesManage,
      PermissionCode.OrgRead,
      PermissionCode.OrgManage,
      PermissionCode.OrgStructureManage,
      PermissionCode.ShiftsRead,
      PermissionCode.ShiftsManage,
      PermissionCode.AttendanceRead,
      PermissionCode.AttendanceManage,
      PermissionCode.AttendanceBlocksCreate,
      PermissionCode.AttendanceBlocksManage,
      PermissionCode.ReportsRead,
      PermissionCode.ReportsExport,
      PermissionCode.PayrollControl,
      PermissionCode.AuditRead
    ]
  },
  {
    code: RoleCode.GRH,
    name: "GRH",
    description: "Gestion RH opérationnelle",
    permissions: [
      PermissionCode.EmployeesRead,
      PermissionCode.EmployeesManage,
      PermissionCode.OrgRead,
      PermissionCode.ShiftsRead,
      PermissionCode.AttendanceRead,
      PermissionCode.AttendanceBlocksCreate,
      PermissionCode.AttendanceBlocksManage,
      PermissionCode.ReportsRead,
      PermissionCode.ReportsExport
    ]
  },
  {
    code: RoleCode.ResponsableDepartement,
    name: "Responsable département",
    description: "Suivi des équipes du département et consultation des rapports",
    permissions: [
      PermissionCode.EmployeesRead,
      PermissionCode.OrgRead,
      PermissionCode.OrgManage,
      PermissionCode.ShiftsRead,
      PermissionCode.ShiftsManage,
      PermissionCode.AttendanceRead,
      PermissionCode.AttendanceBlocksCreate,
      PermissionCode.ReportsRead
    ]
  },
  {
    code: RoleCode.HR,
    name: "RH",
    description: "Ancien rôle RH conservé pour compatibilité",
    permissions: [
      PermissionCode.EmployeesRead,
      PermissionCode.EmployeesManage,
      PermissionCode.OrgRead,
      PermissionCode.ShiftsRead,
      PermissionCode.ShiftsManage,
      PermissionCode.AttendanceRead,
      PermissionCode.AttendanceManage,
      PermissionCode.AttendanceBlocksCreate,
      PermissionCode.AttendanceBlocksManage,
      PermissionCode.ReportsRead,
      PermissionCode.ReportsExport
    ]
  },
  {
    code: RoleCode.Supervisor,
    name: "Superviseur",
    description: "Ancien rôle superviseur conservé pour compatibilité",
    permissions: [
      PermissionCode.EmployeesRead,
      PermissionCode.OrgRead,
      PermissionCode.OrgManage,
      PermissionCode.ShiftsRead,
      PermissionCode.ShiftsManage,
      PermissionCode.AttendanceRead,
      PermissionCode.AttendanceBlocksCreate,
      PermissionCode.ReportsRead
    ]
  },
  {
    code: RoleCode.ReadOnly,
    name: "Lecture seule",
    description: "Consultation sans modification",
    permissions: [
      PermissionCode.EmployeesRead,
      PermissionCode.OrgRead,
      PermissionCode.ShiftsRead,
      PermissionCode.AttendanceRead,
      PermissionCode.ReportsRead
    ]
  }
] as const;
