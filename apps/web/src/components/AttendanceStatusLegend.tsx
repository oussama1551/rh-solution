import { attendanceStatusLegend } from "../lib/attendanceStatus";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";

export function AttendanceStatusLegend() {
  return (
    <div className="attendance-legend">
      {attendanceStatusLegend.map(status => <AttendanceStatusBadge key={status} status={status} />)}
    </div>
  );
}
