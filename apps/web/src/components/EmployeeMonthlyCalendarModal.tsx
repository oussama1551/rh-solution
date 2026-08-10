import { Printer, X } from "lucide-react";
import { Button } from "./Button";
import { AttendanceStatusBadge } from "./AttendanceStatusBadge";
import { AttendanceStatusLegend } from "./AttendanceStatusLegend";
import { LoadingState } from "./LoadingState";
import { attendanceStatusClass } from "../lib/attendanceStatus";
import { shiftLabels, timingLabels } from "../lib/shiftLabels";
import { AttendanceMonthlyCalendar } from "../lib/types";
import { useApi } from "../lib/useApi";

export function EmployeeMonthlyCalendarModal({ employee, month, onClose }: { employee: { id: string; name: string } | null; month?: string; onClose: () => void }) {
  const calendarPath = employee ? `/api/attendance/employees/${employee.id}/monthly-calendar?month=${month || currentMonth()}` : null;
  const calendar = useApi<AttendanceMonthlyCalendar | null>(calendarPath, null);

  if (!employee) return null;

  return (
    <div className="modal-backdrop">
      <div className="calendar-modal employee-calendar-print">
        <div className="modal-header">
          <div>
            <span>Calendrier mensuel</span>
            <strong>{employee.name}</strong>
          </div>
          <div className="row-actions no-print">
            <Button variant="secondary" onClick={printEmployeeCalendar}><Printer size={16} /> Imprimer</Button>
            <button className="icon-button" onClick={onClose} title="Fermer"><X size={18} /></button>
          </div>
        </div>
        {calendar.loading && <LoadingState label="Chargement du calendrier mensuel..." />}
        {calendar.data && <AttendanceCalendar data={calendar.data} />}
      </div>
    </div>
  );
}

function AttendanceCalendar({ data }: { data: AttendanceMonthlyCalendar }) {
  const byDate = new Map(data.days.map(day => [day.workDate, day]));
  const days = data.period?.days || periodDays(payrollPeriod(data.month).from, payrollPeriod(data.month).to);
  const cells = buildPeriodCells(days);

  return (
    <>
      <div className="attendance-summary-strip compact">
        <div><span>Jours</span><strong>{data.totals.workedDays}</strong></div>
        <div><span>Heures</span><strong>{hoursLabel(data.totals.totalHours)}</strong></div>
        <div><span>Heures sup.</span><strong>{hoursLabel(data.totals.overtimeHours || 0)}</strong></div>
        <div><span>{shiftLabels.MORNING}</span><strong>{data.totals.morningDays}</strong></div>
        <div><span>{shiftLabels.EVENING}</span><strong>{data.totals.eveningDays}</strong></div>
        <div><span>{shiftLabels.NIGHT}</span><strong>{data.totals.nightDays}</strong></div>
        <div><span>{shiftLabels.FLEXIBLE}</span><strong>{data.totals.normalDays}</strong></div>
      </div>
      {!data.summaryAvailable && <div className="alert">Synthèse non générée pour cette période: le calendrier affiche seulement les jours avec pointages.</div>}
      <AttendanceStatusLegend />
      <div className="attendance-calendar">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div className="calendar-head" key={day}>{day}</div>)}
        {cells.map(cell => {
          const day = cell.date ? byDate.get(cell.date) : null;
          const status = day?.summaryStatus || null;
          return (
            <div key={cell.key} className={`calendar-day ${day ? `calendar-${day.timing.toLowerCase()}` : ""} ${status ? `report-status-${attendanceStatusClass(status)}` : ""}`}>
              {cell.date && <><strong>{cell.day}</strong><small>{cell.month}</small></>}
              {day && (
                <>
                  <AttendanceStatusBadge status={status || (day.isIncomplete ? "INCOMPLETE" : "PRESENT")} />
                  <span>{timingLabels[day.timing]}</span>
                  <small>{day.assignmentSource === "assigned" ? "Assigné" : day.assignmentSource === "summary" ? "Synthèse paie" : "Déduit"}</small>
                  <small>{formatTime(day.firstPunchTime)} - {formatTime(day.lastPunchTime)}</small>
                  {day.declarationFirstPunchTime && (
                    <small className="declaration-punch-note">
                      Pointage détecté: {formatTime(day.declarationFirstPunchTime)}
                      {day.declarationLastPunchTime && day.declarationLastPunchTime !== day.declarationFirstPunchTime ? ` - ${formatTime(day.declarationLastPunchTime)}` : ""}
                      {day.declarationPunchCount ? ` (${day.declarationPunchCount})` : ""}
                    </small>
                  )}
                  <small>{day.isIncomplete ? "Incomplet" : hoursLabel(day.workedHours)}</small>
                  {(day.overtimeHours || 0) > 0 && <small className="overtime-calendar-line">Sup: {hoursLabel(day.overtimeHours || 0)}</small>}
                </>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

function currentMonth() {
  const today = new Date();
  const label = today.getDate() >= 26 ? new Date(today.getFullYear(), today.getMonth() + 1, 1) : today;
  return `${label.getFullYear()}-${String(label.getMonth() + 1).padStart(2, "0")}`;
}

function payrollPeriod(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(year, monthNumber - 1, 25);
  const start = new Date(year, monthNumber - 2, 26);
  return { from: dateKey(start), to: dateKey(end) };
}

function periodDays(from: string, to: string) {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00`);
  const end = new Date(`${to}T00:00:00`);
  while (cursor <= end) {
    days.push(dateKey(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  return days;
}

function buildPeriodCells(days: string[]) {
  if (!days.length) return [];
  const first = new Date(`${days[0]}T00:00:00`);
  const leading = (first.getDay() + 6) % 7;
  const formatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  return [
    ...Array.from({ length: leading }, (_, index) => ({ key: `empty-${index}`, date: null as string | null, day: "", month: "" })),
    ...days.map(date => {
      const parsed = new Date(`${date}T00:00:00`);
      return {
        key: date,
        date,
        day: String(parsed.getDate()).padStart(2, "0"),
        month: formatter.format(parsed)
      };
    })
  ];
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false
  });
}

function hoursLabel(value: number) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function printEmployeeCalendar() {
  document.body.dataset.printMode = "employee-calendar";
  const cleanup = () => {
    delete document.body.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => window.print(), 50);
}
