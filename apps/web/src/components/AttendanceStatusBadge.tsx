import { AttendanceSummaryStatus } from "../lib/types";
import { attendanceStatusClass, attendanceStatusLabel } from "../lib/attendanceStatus";

export function AttendanceStatusBadge({ status, label }: { status?: AttendanceSummaryStatus | null; label?: string }) {
  return (
    <span className={`attendance-status-badge report-status-${attendanceStatusClass(status)}`}>
      {label || attendanceStatusLabel(status)}
    </span>
  );
}
