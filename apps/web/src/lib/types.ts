export type Permission =
  | "administration.read"
  | "administration.manage"
  | "users.read"
  | "users.manage"
  | "roles.read"
  | "roles.manage"
  | "employees.read"
  | "employees.manage"
  | "org.read"
  | "org.manage"
  | "org.structure.manage"
  | "shifts.read"
  | "shifts.manage"
  | "attendance.read"
  | "attendance.manage"
  | "attendance_blocks.create"
  | "attendance_blocks.manage"
  | "devices.read"
  | "reports.read"
  | "reports.export"
  | "payroll.control"
  | "sync.run"
  | "audit.read";

export type User = {
  id: string;
  username: string;
  fullName?: string;
  roles: string[];
  permissions: Permission[];
};

export type UserSummary = {
  id: string;
  username: string;
  fullName?: string | null;
};

export type ApiState<T> = {
  data: T;
  loading: boolean;
  error: string | null;
};

export type Employee = {
  id: string;
  zktecoId: string;
  groupId?: string | null;
  biotimeCode?: string | null;
  localMatricule?: string | null;
  employeeCode: string;
  fullName: string;
  department: string | null;
  phone?: string | null;
  sapPhone?: string | null;
  displayPhone?: string | null;
  photoUrl?: string | null;
  photoProxyUrl?: string | null;
  hireDate?: string | null;
  status: "ACTIVE" | "RESIGNED";
  biometricEnrollment?: BiometricEnrollment;
  sapMappings?: EmployeeMapping[];
  sapDirectoryRecords?: SapDirectoryEmployee[];
  group?: OrgGroup | null;
};

export type AdvancedTreatmentRiskLevel = "HIGH" | "MEDIUM" | "LOW";

export type AdvancedTreatmentRow = {
  employee: {
    id: string;
    code: string;
    fullName: string;
    lastName: string | null;
    firstName: string | null;
    company: string | null;
    department: string | null;
    hireDate: string | null;
    unitName: string | null;
    subUnitName: string | null;
    groupName: string | null;
  };
  periodStart: string;
  periodEnd: string;
  seniorityMonths: number;
  bankAccount: string | null;
  punchedDays: number;
  emptyDays: number;
  justifiedDays: number;
  sickDays: number;
  leaveDays: number;
  analyzableDays: number;
  riskLevel: AdvancedTreatmentRiskLevel;
  riskLabel: string;
  confirmed: boolean;
  confirmedAt: string | null;
  confirmedBy: UserSummary | null;
  frozen: boolean;
  frozenAt: string | null;
  frozenBy: UserSummary | null;
};

export type AdvancedTreatmentResponse = {
  periodStart: string;
  periodEnd: string;
  rows: AdvancedTreatmentRow[];
  stats: {
    total: number;
    confirmed: number;
    frozen: number;
    missingBankAccount: number;
    high: number;
    medium: number;
    low: number;
  };
};

export type AdvancedTreatmentCalendar = {
  employee: {
    id: string;
    fullName: string;
  };
  periodStart: string;
  periodEnd: string;
  stats: {
    daysWithPunches: number;
    punchCount: number;
    sickDays: number;
    leaveDays: number;
    warningDays: number;
    periodDays: number;
  };
  days: Array<{
    date: string;
    punches: Array<{
      id: string;
      punchTime: string;
      punchHour: string;
      sourceDevice: string | null;
    }>;
    sick: boolean;
    leave: boolean;
    warning: boolean;
  }>;
};

export type BiometricEnrollment = {
  fingerprint: boolean;
  face: boolean;
  palm?: boolean;
  visibleLightFace?: boolean;
  visibleLightPalm?: boolean;
};

export type ResignRecordRow = {
  id: string;
  biotimeId: string;
  resignDate: string | null;
  reason: string | null;
  resignType: string;
  employeeZktecoId: string | null;
  employeeName: string;
  employeeCode: string;
  department: string;
  status: "ACTIVE" | "RESIGNED";
  employee: Employee | null;
};

export type BioTimeDepartment = {
  code: string;
  name: string;
  parentCode?: string | null;
  children?: BioTimeDepartment[];
};

export type BioTimeDepartmentResponse = {
  departments: BioTimeDepartment[];
  tree: BioTimeDepartment[];
};

export type BioTimeEmployeeLive = {
  local: Employee;
  biotime: BioTimeEmployeeForm;
};

export type BioTimeEmployeeForm = {
  id?: string | null;
  localId?: string | null;
  empCode?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  fullName?: string | null;
  department?: string | null;
  departmentName?: string | null;
  position?: string | null;
  employmentType?: string | null;
  hireDate?: string | null;
  area?: string | null;
  superior?: string | null;
  workflowRole?: string | null;
  localName?: string | null;
  gender?: string | null;
  birthday?: string | null;
  contactTel?: string | null;
  officeTel?: string | null;
  mobile?: string | null;
  national?: string | null;
  city?: string | null;
  address?: string | null;
  postcode?: string | null;
  email?: string | null;
  photo?: string | null;
  raw?: Record<string, unknown>;
};

export type OrgUnit = {
  id: string;
  name: string;
  code: string;
  description?: string | null;
  isSouthWilaya?: boolean;
  employeeCount: number;
  subUnits: OrgSubUnit[];
};

export type OrgSubUnit = {
  id: string;
  unitId: string;
  name: string;
  description?: string | null;
  isSouthWilaya?: boolean;
  biotimeDepartmentCode?: string | null;
  employeeCount: number;
  unit?: OrgUnit;
  groups: OrgGroup[];
};

export type OrgGroup = {
  id: string;
  subUnitId: string;
  name: string;
  description?: string | null;
  status?: ApprovalStatus;
  submittedAt?: string | null;
  submittedBy?: UserSummary | null;
  reviewedAt?: string | null;
  reviewedBy?: UserSummary | null;
  rejectionReason?: string | null;
  pendingName?: string | null;
  pendingDescription?: string | null;
  pendingDeleteRequested?: boolean;
  createdBy?: UserSummary | null;
  employeeCount: number;
  subUnit?: OrgSubUnit & { unit?: OrgUnit };
};

export type OrgEmployee = Employee & {
  group?: OrgGroup | null;
};

export type DepartmentMappingSuggestion = {
  department: string;
  employeeCount: number;
  suggestions: Array<{
    unitId: string;
    unitName: string;
    subUnitId: string;
    subUnitName: string;
    score: number;
  }>;
};

export type Device = {
  id: string;
  name: string;
  ipAddress?: string | null;
  area?: string | null;
  status: "ONLINE" | "OFFLINE" | "UNKNOWN";
  lastSeenAt?: string | null;
};

export type Shift = {
  id: string;
  code: string;
  name: string;
  startTime: string;
  endTime: string;
  spansMidnight: boolean;
  applicableDays: string[];
  toleranceBeforeMinutes: number;
  toleranceAfterMinutes: number;
  isActive: boolean;
  _count?: {
    assignments: number;
  };
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
  absenceAlerts: Array<{
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
      punchTime: string;
      direction: string;
      sourceId: string | null;
    }>;
  }>;
};

export type AttendanceFlag = {
  id: string;
  status: "PENDING" | "VALIDATED" | "REJECTED";
  reason?: string | null;
  punch: {
    id: string;
    punchTime: string;
    direction: "CHECK_IN" | "CHECK_OUT" | "UNKNOWN";
    shiftStatus: string;
    employee: Employee;
    shift?: { name: string; startTime: string; endTime: string } | null;
  };
};

export type AttendancePunchRow = {
  id: string;
  punchTime: string;
  punchDate: string;
  punchHour: string;
  direction: "CHECK_IN" | "CHECK_OUT" | "UNKNOWN";
  shiftDate: string | null;
  shiftStatus: "ON_TIME" | "LATE" | "EARLY" | "OUT_OF_WINDOW" | "UNMATCHED";
  countsAsPresence: boolean;
  zktecoPunchId: string | null;
  biotimeId: string | null;
  sourceDevice: string | null;
  verifyMode: string | null;
  workCode: string | null;
  employee: {
    id: string;
    zktecoId: string;
    biotimeCode: string | null;
    localMatricule: string | null;
    employeeCode: string;
    displayMatricule: string;
    fullName: string;
    department: string | null;
    status: "ACTIVE" | "RESIGNED";
    sapPhone: string | null;
    sapCompany: string | null;
    sapEmpId: string | null;
  };
  shift: {
    id: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    spansMidnight: boolean;
  } | null;
  flags: Array<{
    id: string;
    type: "OUT_OF_WINDOW";
    status: "PENDING" | "VALIDATED" | "REJECTED";
    reason: string | null;
    reviewNote: string | null;
  }>;
};

export type EmployeeRawPunch = {
  id: string;
  punchTime: string;
  punchDate: string;
  punchHour: string;
  direction: "CHECK_IN" | "CHECK_OUT" | "UNKNOWN";
  shiftDate: string | null;
  shiftStatus: string;
  countsAsPresence: boolean;
  zktecoPunchId: string | null;
  biotimeId: string | null;
  sourceUploadedAt?: string | null;
  sourceDevice: string | null;
  verifyMode: string | null;
  punchType: string | null;
  workCode: string | null;
  shift: {
    id: string;
    code: string;
    name: string;
    startTime: string;
    endTime: string;
    spansMidnight: boolean;
  } | null;
  rawPayload?: Record<string, unknown> | null;
};

export type PresumedAbsenceStatus = "PENDING_REVIEW" | "CONFIRMED" | "REJECTED";

export type PresumedAbsence = {
  id: string;
  date: string;
  detectedAt: string;
  basis: string;
  status: PresumedAbsenceStatus;
  reviewedAt?: string | null;
  reviewNote?: string | null;
  employee: {
    id: string;
    zktecoId: string;
    biotimeCode: string | null;
    localMatricule: string | null;
    employeeCode: string;
    fullName: string;
    department: string | null;
    status: "ACTIVE" | "RESIGNED";
  };
  reviewedBy?: UserSummary | null;
};

export type AttendanceTiming = "MORNING" | "EVENING" | "NIGHT" | "NORMAL";
export type ShiftType = "MORNING" | "EVENING" | "NIGHT" | "FLEXIBLE" | "REPOS" | "SEC_MORNING" | "SEC_NIGHT";
export type ApprovalStatus = "DRAFT" | "PENDING_APPROVAL" | "APPROVED" | "REJECTED";
export type OvertimeRateType = "RATE_50" | "RATE_75" | "RATE_100";
export type AttendanceSummaryStatus = "PRESENT" | "ABSENT" | "SICK" | "LEAVE" | "ACCIDENT" | "COMPENSATED" | "ABSENCE_REVERSED" | "REST" | "INCOMPLETE" | "EMPTY";
export type NotificationType =
  | "PENDING_APPROVAL"
  | "APPROVAL_RESULT"
  | "OVERTIME_DECLARED"
  | "COMPENSATION_DECLARED"
  | "SICK_LEAVE_DECLARED"
  | "LEAVE_DECLARED"
  | "SYNC_ERROR"
  | "CHAT_MESSAGE"
  | "SYSTEM";

export type AttendanceDailyRow = {
  id: string;
  workDate: string;
  employee: {
    id: string;
    zktecoId: string;
    biotimeCode: string | null;
    localMatricule: string | null;
    employeeCode: string;
    displayMatricule: string;
    fullName: string;
    department: string | null;
    status: "ACTIVE" | "RESIGNED";
    sapPhone: string | null;
    sapCompany: string | null;
    sapEmpId: string | null;
  };
  firstPunchTime: string | null;
  lastPunchTime: string | null;
  firstPunchId: string | null;
  lastPunchId: string | null;
  punchCount: number;
  workedHours: number;
  overtimeHours?: number;
  overtimeHoursRate50?: number;
  overtimeHoursRate75?: number;
  overtimeHoursRate100?: number;
  timing: AttendanceTiming;
  shiftType: ShiftType;
  shiftLabel: string;
  assignmentSource: "assigned" | "fallback" | "summary";
  assignedVia: "individual" | "group" | null;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  serviceStatus: "complete" | "incomplete";
  isIncomplete: boolean;
  sourceDevice: string | null;
  summaryStatus?: AttendanceSummaryStatus | null;
  declarationFirstPunchTime?: string | null;
  declarationLastPunchTime?: string | null;
  declarationPunchCount?: number | null;
};

export type ShiftDefinition = {
  id: string;
  shiftType: ShiftType;
  label: string;
  startTime: string | null;
  endTime: string | null;
  spansMidnight: boolean;
  marginMinutes: number;
};

export type EmployeeShiftAssignment = {
  id: string;
  employeeId: string;
  date: string;
  assignedVia: "individual" | "group";
  sourceGroupId: string | null;
  status?: ApprovalStatus;
  submittedAt?: string | null;
  rejectionReason?: string | null;
  shiftDefinition: ShiftDefinition;
  sourceGroup?: { id: string; name: string } | null;
};

export type ShiftPlanningDay = {
  date: string;
  shiftType: ShiftType | null;
  label: string | null;
  state: "assigned" | "empty" | "mixed";
  assignedVia: "individual" | "group" | null;
  sourceGroupId: string | null;
  sourceGroupName: string | null;
  approvalStatus?: ApprovalStatus | null;
};

export type ShiftPlanningState = {
  target: {
    type: "employee" | "group";
    id: string;
    employeeCount: number;
  };
  period: {
    key: string;
    label: string;
    from: string;
    to: string;
    startDay: number;
    days: string[];
  };
  definitions: ShiftDefinition[];
  approvalSummary: {
    status: ApprovalStatus;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    draftCount: number;
    latestApprovedAt: string | null;
    latestApprovedBy: UserSummary | null;
    latestPendingAt: string | null;
    latestPendingBy: UserSummary | null;
    latestRejectedAt: string | null;
    latestRejectedBy: UserSummary | null;
    latestRejectionReason: string | null;
  };
  days: ShiftPlanningDay[];
};

export type ShiftPlanningPrint = {
  generatedAt: string;
  period: {
    key: string;
    label: string;
    from: string;
    to: string;
    days: string[];
  };
  groups: Array<{
    id: string;
    name: string;
    unitName: string;
    subUnitName: string;
    employees: Array<{
      id: string;
      fullName: string;
      code: string;
      days: Array<{
        date: string;
        shiftType: ShiftType | null;
        label: string | null;
        approvalStatus: ApprovalStatus | null;
      }>;
    }>;
    days: Array<{
      date: string;
      shiftType: ShiftType | null;
      label: string | null;
      state: "assigned" | "empty" | "mixed";
      approvalStatus: ApprovalStatus | null;
    }>;
  }>;
};

export type PlanningApprovals = {
  groups: Array<{
    id: string;
    type: "group";
    name: string;
    status: ApprovalStatus;
    submittedAt: string | null;
    submittedBy: { id: string; username: string; fullName: string } | null;
    pendingAction?: "CREATE" | "UPDATE" | "DELETE";
    pendingName?: string | null;
    pendingDescription?: string | null;
    pendingDeleteRequested?: boolean;
    unitName: string;
    subUnitName: string;
    employeeCount: number;
  }>;
  plannings: Array<{
    id: string;
    type: "planning";
    status: ApprovalStatus;
    submittedAt: string | null;
    submittedBy: { id: string; username: string; fullName: string } | null;
    group: { id: string; name: string; unitName: string; subUnitName: string } | null;
    employeeCount: number;
    dayCount: number;
    preview: Array<{
      date: string;
      employeeName: string;
      employeeCode: string;
      shiftType: ShiftType;
      shiftLabel: string;
    }>;
  }>;
  memberships: Array<{
    id: string;
    type: "membership";
    status: ApprovalStatus;
    submittedAt: string | null;
    submittedBy: { id: string; username: string; fullName: string } | null;
    employee: { id: string; fullName: string; code: string };
    fromGroup: { id: string; name: string; unitName: string; subUnitName: string } | null;
    toGroup: { id: string; name: string; unitName: string; subUnitName: string } | null;
    action: "ADD" | "MOVE" | "REMOVE";
  }>;
};

export type ManualDeclarationApprovals = {
  overtime: Array<{
    id: string;
    date: string;
    hours: string | number;
    rateType: OvertimeRateType;
    ratePercent: string | number;
    reason: string | null;
    status: ApprovalStatus;
    createdAt: string;
    employee: { id: string; fullName: string; localMatricule: string | null; biotimeCode: string | null; employeeCode: string };
    declaredBy: UserSummary | null;
  }>;
  compensations: Array<{
    id: string;
    absenceDate: string;
    compensationDate: string;
    note: string | null;
    status: ApprovalStatus;
    createdAt: string;
    employee: { id: string; fullName: string; localMatricule: string | null; biotimeCode: string | null; employeeCode: string };
    declaredBy: UserSummary | null;
  }>;
  leaves: Array<{
    id: string;
    dateStart: string;
    dateEnd: string;
    leaveType: LeaveType;
    exceptionalReason?: ExceptionalLeaveReason | null;
    note: string | null;
    status: ApprovalStatus;
    createdAt: string;
    employee: { id: string; fullName: string; localMatricule: string | null; biotimeCode: string | null; employeeCode: string };
    declaredBy: UserSummary | null;
  }>;
  absenceReversals: Array<{
    id: string;
    absenceDate: string;
    reason: string;
    status: ApprovalStatus;
    createdAt: string;
    employee: { id: string; fullName: string; localMatricule: string | null; biotimeCode: string | null; employeeCode: string };
    declaredBy: UserSummary | null;
  }>;
};

export type AttendanceMonthlyCalendar = {
  employee: AttendanceDailyRow["employee"] | null;
  month: string;
  summaryAvailable?: boolean;
  period?: {
    from: string;
    to: string;
    label: string;
    days: string[];
  };
  days: AttendanceDailyRow[];
  totals: {
    workedDays: number;
    totalHours: number;
    overtimeHours?: number;
    morningDays: number;
    eveningDays: number;
    nightDays: number;
    normalDays: number;
    incompleteDays: number;
  };
};

export type MonthlyReportRow = {
  employee: {
    id: string;
    code: string;
    sourceCode: string;
    localMatricule: string | null;
    fullName: string;
    department: string | null;
    status: "ACTIVE" | "RESIGNED";
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

export type PointagePlanningReportRow = {
  id: string;
  workDate: string;
  employee: {
    id: string;
    code: string;
    sourceCode: string;
    fullName: string;
    department: string | null;
    status: "ACTIVE" | "RESIGNED";
    groupName: string | null;
    subUnitName: string | null;
    unitName: string | null;
  };
  plannedShiftType: ShiftType | null;
  plannedShiftLabel: string | null;
  planningSource: "assigned" | "fallback" | "empty";
  assignedVia: "individual" | "group" | null;
  sourceGroupName: string | null;
  firstPunchTime: string | null;
  lastPunchTime: string | null;
  punchCount: number;
  workedHours: number;
  serviceStatus: "complete" | "incomplete" | "absent" | "repos" | "empty";
};

export type DailyAbsenceReport = {
  date: string;
  generatedAt: string;
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
  rows: Array<{
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
      type: ShiftType;
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
      punchTime: string;
      direction: string;
      sourceId: string | null;
    }>;
  }>;
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
  lastGeneratedAt: string;
};

export type SummaryDailyRecordRow = {
  id: string;
  workDate: string;
  status: AttendanceSummaryStatus;
  workedHours: number;
  overtimeHours: number;
  overtimeHoursRate50: number;
  overtimeHoursRate75: number;
  overtimeHoursRate100: number;
  shiftType: ShiftType | null;
  leaveType: LeaveType | null;
  exceptionalReason: ExceptionalLeaveReason | null;
  generatedAt: string;
};

export type OvertimeDeclaration = {
  id: string;
  date: string;
  hours: string | number;
  rateType: OvertimeRateType;
  ratePercent?: string | number | null;
  reason?: string | null;
  status: ApprovalStatus;
  createdAt: string;
  approvedAt?: string | null;
  employee: {
    id: string;
    fullName: string;
    localMatricule?: string | null;
    biotimeCode?: string | null;
    employeeCode?: string | null;
  };
  declaredBy?: UserSummary | null;
  approvedBy?: UserSummary | null;
};

export type SickLeaveDeclaration = {
  id: string;
  dateStart: string;
  dateEnd: string;
  note?: string | null;
  status: ApprovalStatus;
  createdAt: string;
  employee: {
    id: string;
    fullName: string;
    department?: string | null;
    localMatricule?: string | null;
    biotimeCode?: string | null;
    employeeCode?: string | null;
  };
  declaredBy?: UserSummary | null;
  approvedBy?: UserSummary | null;
};

export type LeaveType = "ANNUEL" | "EXCEPTIONNEL" | "SANS_SOLDE" | "MATERNITE";
export type ExceptionalLeaveReason = "MARIAGE_EMPLOYE" | "NAISSANCE_ENFANT" | "MARIAGE_ENFANT" | "DECES_CONJOINT" | "DECES_PARENT_PROCHE" | "CIRCONCISION_FILS" | "HAJJ";
export type LeaveDeclaration = SickLeaveDeclaration & {
  leaveType: LeaveType;
  exceptionalReason?: ExceptionalLeaveReason | null;
};

export type AnnualLeaveBalance = {
  employeeId: string;
  year: number;
  daysEntitled: string | number;
  daysTaken: string | number;
  daysRemaining: string | number;
  calculatedAt: string;
};

export type AbsenceReversalRequest = {
  id: string;
  absenceDate: string;
  reason: string;
  status: ApprovalStatus;
  createdAt: string;
  approvedAt?: string | null;
  employee: {
    id: string;
    fullName: string;
    department?: string | null;
    localMatricule?: string | null;
    biotimeCode?: string | null;
    employeeCode?: string | null;
  };
  declaredBy?: UserSummary | null;
  approvedBy?: UserSummary | null;
};

export type PayrollMapTarget = "ABSENCE" | "OVERTIME_50" | "OVERTIME_75" | "OVERTIME_100" | "SICK" | "COMPENSATION" | "IGNORED";

export type PayrollRubricMapping = {
  id: string;
  rubricCode: string;
  rubricLabel: string | null;
  mapsTo: PayrollMapTarget;
  importCount: number;
};

export type PayrollControlRow = {
  employee: {
    id: string;
    code: string;
    fullName: string;
    org: string;
  };
  rh: PayrollControlValues;
  sap: PayrollControlValues;
  diff: PayrollControlValues;
  hasDiff: boolean;
};

export type PayrollControlValues = {
  absence: number;
  overtime50: number;
  overtime75: number;
  overtime100: number;
  sick: number;
  compensation: number;
};

export type PayrollControlResponse = {
  period: string;
  startDate: string;
  endDate: string;
  tolerance: number;
  rows: PayrollControlRow[];
  totals: {
    employees: number;
    withDiff: number;
  };
};

export type SyncState = {
  connected: boolean;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  running: boolean;
  lastError: string | null;
};

export type SyncLog = {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: "RUNNING" | "SUCCESS" | "FAILED";
  trigger: string;
  employeesCount: number;
  resignsCount: number;
  devicesCount: number;
  punchesCount: number;
  errorMessage: string | null;
  metadata?: {
    full?: boolean;
    reactivatedCount?: number;
    missingBiotimeArchivedCount?: number;
    backfillPunchesCount?: number;
    backfillRowsCount?: number;
    employeePunchSweepCount?: number;
    employeePunchSweepRowsCount?: number;
    employeePunchSweepEmployeesCount?: number;
    kind?: string;
    from?: string;
    to?: string;
    rowsCount?: number;
    employeesCount?: number;
    employeesWithRows?: number;
  } | null;
};

export type NotificationItem = {
  id: string;
  type: NotificationType;
  title: string;
  message: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotificationList = {
  items: NotificationItem[];
  total: number;
  page: number;
  limit: number;
};

export type NotificationMenuCounts = {
  notifications: number;
  validation: number;
  messages: number;
};

export type ChatUser = {
  id: string;
  username: string;
  fullName: string | null;
  roles?: string[];
};

export type ChatConversation = {
  id: string;
  type: "DIRECT" | "GROUP";
  name: string;
  createdAt: string;
  participants: UserSummary[];
  lastMessage: ChatMessage | null;
  unreadCount: number;
};

export type ChatMessage = {
  id: string;
  conversationId: string;
  senderId: string;
  content: string;
  createdAt: string;
  sender: UserSummary;
};

export type SapEmployee = {
  empID: string;
  Nom: string | null;
  Prenom: string | null;
  Poste: string | null;
  Structure: string | null;
  Date_Entrer: string | null;
  mobile: string | null;
  company: string;
  sapFullName: string;
  normalizedName: string;
  normalizedPhone: string;
};

export type SapSuggestion = {
  empID: string;
  company?: string;
  sapFullName: string;
  mobile: string | null;
  Poste?: string | null;
  Structure?: string | null;
  score: number;
  nameMatches: boolean;
  phoneMatches: boolean;
  sap?: SapEmployee;
};

export type EmployeeMapping = {
  id?: string;
  sapEmpId: string;
  sapFullName: string;
  sapMobile: string | null;
  confidenceScore: number;
  status: "confirmed" | "pending_review" | "rejected";
  matchMethod?: "auto_name_phone" | "auto_partial" | "manual";
  metadata?: {
    company?: string;
    Poste?: string | null;
    Structure?: string | null;
  } | null;
};

export type SapQueueItem = {
  employee: Employee;
  mapping?: EmployeeMapping;
  suggestions: SapSuggestion[];
};

export type SapQueue = {
  pending: SapQueueItem[];
  unmapped: SapQueueItem[];
};

export type SapAllMappingRow = {
  employee: Employee;
  mapping: EmployeeMapping | null;
  mappingStatus: "confirmed" | "pending_review" | "rejected" | "unmapped";
  sapCompany: string | null;
  sapPoste: string | null;
  sapStructure: string | null;
};

export type SapDirectoryCacheStatus = {
  loaded: boolean;
  employeeCount: number;
  refreshedAt: string | null;
  ttlMinutes: number;
  expiresAt: string | null;
};

export type SapDirectoryEmployee = {
  id: string;
  sapEmpId: string;
  sapCompany: string;
  biotimeId: string | null;
  employeeId: string | null;
  lastName: string | null;
  firstName: string | null;
  fullName: string;
  poste: string | null;
  structure: string | null;
  hireDate: string | null;
  mobile: string | null;
  lastSyncedAt: string;
  employee?: {
    id: string;
    zktecoId: string;
    biotimeCode: string | null;
    employeeCode: string;
    localMatricule: string | null;
    fullName: string;
    department: string | null;
    status: "ACTIVE" | "RESIGNED";
  } | null;
};

export type BiotimeDirectoryEmployee = {
  id: string;
  zktecoId: string;
  biotimeCode: string | null;
  localMatricule: string | null;
  employeeCode: string;
  fullName: string;
  department: string | null;
  phone: string | null;
  hireDate: string | null;
  resignedAt: string | null;
  status: "ACTIVE" | "RESIGNED";
  sapRecords: SapDirectoryEmployee[];
};

export type SapDirectoryRefreshResult = {
  total: number;
  linked: number;
  unlinked: number;
  localMatricules?: {
    updated: number;
    cleared: number;
  };
  cache: SapDirectoryCacheStatus;
  biotimeSync?: SyncLog;
};
