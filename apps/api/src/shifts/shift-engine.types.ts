export const DayOfWeek = {
  Monday: "MONDAY",
  Tuesday: "TUESDAY",
  Wednesday: "WEDNESDAY",
  Thursday: "THURSDAY",
  Friday: "FRIDAY",
  Saturday: "SATURDAY",
  Sunday: "SUNDAY"
} as const;

export type DayOfWeek = (typeof DayOfWeek)[keyof typeof DayOfWeek];

export const PunchDirection = {
  CheckIn: "CHECK_IN",
  CheckOut: "CHECK_OUT",
  Unknown: "UNKNOWN"
} as const;

export type PunchDirection = (typeof PunchDirection)[keyof typeof PunchDirection];

export const PunchShiftStatus = {
  OnTime: "ON_TIME",
  Late: "LATE",
  Early: "EARLY",
  OutOfWindow: "OUT_OF_WINDOW",
  Unmatched: "UNMATCHED"
} as const;

export type PunchShiftStatus = (typeof PunchShiftStatus)[keyof typeof PunchShiftStatus];

export const DailyAttendanceStatus = {
  Complete: "COMPLETE",
  MissingCheckIn: "MISSING_CHECK_IN",
  MissingCheckOut: "MISSING_CHECK_OUT",
  MissingBoth: "MISSING_BOTH"
} as const;

export type DailyAttendanceStatus = (typeof DailyAttendanceStatus)[keyof typeof DailyAttendanceStatus];

export type ShiftLike = {
  id: string;
  startTime: string;
  endTime: string;
  spansMidnight: boolean;
  applicableDays: DayOfWeek[];
  toleranceBeforeMinutes?: number | null;
  toleranceAfterMinutes?: number | null;
  isActive?: boolean;
};

export type ShiftAssignmentLike = {
  id: string;
  employeeId: string;
  validFrom: Date;
  validTo?: Date | null;
  shift: ShiftLike;
};

export type MatchedPunch = {
  assignmentId: string;
  shiftId: string;
  shiftDate: string;
  status: PunchShiftStatus;
  direction: PunchDirection;
  windowStart: Date;
  plannedStart: Date;
  plannedEnd: Date;
  windowEnd: Date;
};

export type DailyAttendanceSummary = {
  shiftId: string;
  shiftDate: string;
  status: DailyAttendanceStatus;
};
