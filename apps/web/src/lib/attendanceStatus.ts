import { AttendanceSummaryStatus } from "./types";

type AttendanceStatusMeta = {
  label: string;
  className: string;
};

export const attendanceStatusMeta: Record<AttendanceSummaryStatus, AttendanceStatusMeta> = {
  PRESENT: { label: "Présent", className: "complete" },
  ABSENT: { label: "Absent", className: "absent" },
  SICK: { label: "Maladie", className: "sick" },
  LEAVE: { label: "Congé", className: "leave" },
  ACCIDENT: { label: "Accident", className: "accident" },
  COMPENSATED: { label: "Compensé", className: "compensated" },
  ABSENCE_REVERSED: { label: "Sans preuve de pointage", className: "absence-reversed" },
  REST: { label: "Repos", className: "repos" },
  INCOMPLETE: { label: "Incomplet", className: "incomplete" },
  EMPTY: { label: "Non généré", className: "empty" }
};

export function attendanceStatusClass(status?: AttendanceSummaryStatus | null) {
  return attendanceStatusMeta[status || "EMPTY"].className;
}

export function attendanceStatusLabel(status?: AttendanceSummaryStatus | null) {
  return attendanceStatusMeta[status || "EMPTY"].label;
}

export const attendanceStatusLegend: AttendanceSummaryStatus[] = ["PRESENT", "ABSENT", "SICK", "LEAVE", "ACCIDENT", "COMPENSATED", "ABSENCE_REVERSED", "REST", "INCOMPLETE"];
