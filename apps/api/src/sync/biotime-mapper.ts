import { DeviceStatus, EmployeeStatus, Prisma, PunchDirection } from "@prisma/client";
import { BioTimeRecord } from "./biotime.types";

export function stringField(record: BioTimeRecord, keys: string[], fallback = ""): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== null && value !== undefined && String(value).trim() !== "") {
      return String(value).trim();
    }
  }

  return fallback;
}

export function dateField(record: BioTimeRecord, keys: string[]): Date | null {
  const raw = stringField(record, keys);
  if (!raw) return null;
  const localMatch = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(raw);
  if (localMatch) {
    const [, year, month, day, hours, minutes, seconds] = localMatch.map(Number);
    return new Date(year, month - 1, day, hours, minutes, seconds);
  }
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function jsonPayload(record: BioTimeRecord): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(record)) as Prisma.InputJsonValue;
}

export function employeeSourceId(record: BioTimeRecord) {
  return stringField(record, ["id", "emp", "emp_id", "personnel_id", "employee_id"]);
}

export function employeeCode(record: BioTimeRecord) {
  return stringField(record, ["emp_code", "employee_code", "code", "pin", "badgenumber"], employeeSourceId(record));
}

export function employeeName(record: BioTimeRecord) {
  const direct = stringField(record, ["first_name", "name", "full_name", "nickname"]);
  const last = stringField(record, ["last_name"]);
  return [direct, last].filter(Boolean).join(" ").trim() || employeeCode(record);
}

export function departmentName(record: BioTimeRecord) {
  const department = record.department;

  if (department && typeof department === "object") {
    return stringField(department as BioTimeRecord, ["dept_name", "name", "department_name"]);
  }

  return stringField(record, ["department_name", "dept_name", "dept_code"]);
}

export function deviceStatus(record: BioTimeRecord): DeviceStatus {
  const raw = stringField(record, ["status", "state", "online"], "UNKNOWN").toLowerCase();
  if (["online", "1", "true", "connected"].includes(raw)) return DeviceStatus.ONLINE;
  if (["offline", "0", "false", "disconnected"].includes(raw)) return DeviceStatus.OFFLINE;
  return DeviceStatus.UNKNOWN;
}

export function punchDirection(record: BioTimeRecord): PunchDirection {
  const raw = stringField(record, ["punch_state", "punch_type", "verify_state", "state"]).toLowerCase();
  if (["0", "check in", "check_in", "in", "entrée", "entree"].includes(raw)) return PunchDirection.CHECK_IN;
  if (["1", "check out", "check_out", "out", "sortie"].includes(raw)) return PunchDirection.CHECK_OUT;
  return PunchDirection.UNKNOWN;
}

export function resignEmployeeSourceId(record: BioTimeRecord) {
  const employee = record.employee || record.emp;

  if (employee && typeof employee === "object") {
    return employeeSourceId(employee as BioTimeRecord);
  }

  return stringField(record, ["employee", "emp", "emp_id", "employee_id", "personnel_id"]);
}

export function mapResignedStatus(hasResign: boolean) {
  return hasResign ? EmployeeStatus.RESIGNED : EmployeeStatus.ACTIVE;
}

export function ipAddress(record: BioTimeRecord) {
  const value = stringField(record, ["ip_address", "ip"]);
  return /^(\d{1,3}\.){3}\d{1,3}$/.test(value) ? value : null;
}
