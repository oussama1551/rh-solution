import { Prisma } from "@prisma/client";
import { RoleCode } from "../roles/role-codes";
import { RequestUser } from "./request-user.type";

export function isOwnGroupScoped(actor?: RequestUser) {
  const roles = new Set(actor?.roles || []);
  if (roles.has(RoleCode.Admin) || roles.has(RoleCode.DRH)) return false;
  return roles.has(RoleCode.ResponsableDepartement) || roles.has(RoleCode.Supervisor);
}

export function employeeScopeWhere(actor?: RequestUser): Prisma.EmployeeWhereInput {
  return isOwnGroupScoped(actor) ? { group: { createdById: actor?.id } } : {};
}

export function punchEmployeeScopeWhere(actor?: RequestUser): Prisma.AttendancePunchWhereInput {
  return isOwnGroupScoped(actor) ? { employee: { group: { createdById: actor?.id } } } : {};
}

export function shiftAssignmentEmployeeScopeWhere(actor?: RequestUser): Prisma.EmployeeShiftAssignmentWhereInput {
  return isOwnGroupScoped(actor) ? { employee: { group: { createdById: actor?.id } } } : {};
}
