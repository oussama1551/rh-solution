import { EmployeeStatus } from "@prisma/client";

export type ReportFilters = {
  startDate: string;
  endDate: string;
  department?: string;
  employeeId?: string;
  groupId?: string;
  subUnitId?: string;
  unitId?: string;
  search?: string;
  status?: EmployeeStatus;
};

export type MonthlyEmployeeReport = {
  employee: {
    id: string;
    code: string;
    sourceCode: string;
    localMatricule: string | null;
    fullName: string;
    department: string | null;
    status: EmployeeStatus;
  };
  period: {
    startDate: string;
    endDate: string;
  };
  expectedDays: number;
  presentDays: number;
  absentDays: number;
  lateCount: number;
  lateMinutes: number;
  overtimeMinutes: number;
  outOfWindow: {
    pending: number;
    validated: number;
    rejected: number;
  };
};

export type DepartmentReportRow = {
  department: string;
  employeeCount: number;
  expectedDays: number;
  presentDays: number;
  absentDays: number;
  presenceRate: number;
  lateCount: number;
  lateMinutes: number;
  overtimeMinutes: number;
  outOfWindowPending: number;
  outOfWindowValidated: number;
  outOfWindowRejected: number;
};

export type DashboardKpis = {
  presenceRate: number;
  lateCountThisMonth: number;
  pendingAttendanceFlags: number;
  offlineDevices: number;
  employeeCount: number;
  activeEmployeeCount: number;
  workingGroupsToday: number;
  pendingPlanningCount: number;
  absencesToday: number;
  monthlyAbsences: number;
  workingGroups: Array<{
    id: string;
    name: string;
    employeeCount: number;
    shiftLabels: string[];
  }>;
  absenceAlerts: DailyAbsenceRow[];
};

export type PointagePlanningReportRow = {
  id: string;
  workDate: string;
  employee: {
    id: string;
    code: string;
    sourceCode: string;
    fullName: string;
    department: string | null;
    status: EmployeeStatus;
    groupName: string | null;
    subUnitName: string | null;
    unitName: string | null;
  };
  plannedShiftType: string | null;
  plannedShiftLabel: string | null;
  planningSource: "assigned" | "fallback" | "empty";
  assignedVia: "individual" | "group" | null;
  sourceGroupName: string | null;
  firstPunchTime: Date | null;
  lastPunchTime: Date | null;
  punchCount: number;
  workedHours: number;
  serviceStatus: "complete" | "incomplete" | "absent" | "repos" | "empty";
};

export type DailyAbsenceRow = {
  id: string;
  date: string;
  status: "ABSENT" | "NOT_DUE";
  employee: {
    id: string;
    code: string;
    sourceCode: string;
    fullName: string;
    department: string | null;
    unitName: string | null;
    subUnitName: string | null;
    groupName: string | null;
  };
  shift: {
    type: string;
    label: string;
    startTime: string | null;
    endTime: string | null;
  };
  planning: {
    assignedVia: "individual" | "group" | null;
    sourceGroupName: string | null;
    employeeGroupName: string | null;
  };
  punches: Array<{
    id: string;
    punchTime: Date;
    direction: string;
    sourceId: string | null;
  }>;
};

export type DailyAbsenceReport = {
  date: string;
  generatedAt: Date;
  totals: {
    planned: number;
    absent: number;
    notDue: number;
  };
  byUnit: Array<{
    unitName: string;
    planned: number;
    absent: number;
    notDue: number;
  }>;
  rows: DailyAbsenceRow[];
};

export type SummaryReportRow = {
  employee: {
    id: string;
    code: string;
    sourceCode: string;
    fullName: string;
    department: string | null;
    unitName: string | null;
    subUnitName: string | null;
    groupName: string | null;
  };
  presentDays: number;
  absentDays: number;
  sickDays: number;
  leaveDays: number;
  compensatedDays: number;
  absenceReversedDays: number;
  restDays: number;
  incompleteDays: number;
  totalWorkedHours: number;
  totalOvertimeHours: number;
  overtimeHoursRate50: number;
  overtimeHoursRate75: number;
  overtimeHoursRate100: number;
  lastGeneratedAt: Date;
};

export type SummaryDailyRecordRow = {
  id: string;
  workDate: string;
  status: "PRESENT" | "ABSENT" | "SICK" | "LEAVE" | "ACCIDENT" | "COMPENSATED" | "ABSENCE_REVERSED" | "REST" | "INCOMPLETE";
  workedHours: number;
  overtimeHours: number;
  overtimeHoursRate50: number;
  overtimeHoursRate75: number;
  overtimeHoursRate100: number;
  shiftType: string | null;
  leaveType: string | null;
  exceptionalReason: string | null;
  generatedAt: Date;
};
