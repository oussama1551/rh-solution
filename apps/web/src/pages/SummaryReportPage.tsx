import { CalendarDays, ChevronLeft, ChevronRight, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { ExportButtons } from "../components/ExportButtons";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { AttendanceStatusBadge } from "../components/AttendanceStatusBadge";
import { AttendanceStatusLegend } from "../components/AttendanceStatusLegend";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { api, fileUrl } from "../lib/api";
import { attendanceStatusClass } from "../lib/attendanceStatus";
import { shiftLabel } from "../lib/shiftLabels";
import { OrgUnit, SummaryDailyRecordRow, SummaryReportRow } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function SummaryReportPage() {
  const range = currentPayrollPeriod();
  const { filters, update, reset } = useSessionFilters("reports.summary.filters", {
    startDate: range.startDate,
    endDate: range.endDate,
    search: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    status: "ACTIVE"
  });
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;
  const params = useMemo(() => buildParams(filters), [filters]);
  const summary = useApi<SummaryReportRow[]>(`/api/reports/summary?${params.toString()}`, []);
  const [message, setMessage] = useState<string | null>(null);
  const [generatedRows, setGeneratedRows] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [calendarEmployee, setCalendarEmployee] = useState<SummaryReportRow["employee"] | null>(null);
  const calendarParams = useMemo(() => {
    if (!calendarEmployee) return null;
    return buildParams({
      startDate: filters.startDate,
      endDate: filters.endDate,
      employeeId: calendarEmployee.id,
      status: filters.status
    });
  }, [calendarEmployee, filters.endDate, filters.startDate, filters.status]);
  const calendarRows = useApi<SummaryDailyRecordRow[]>(
    calendarParams ? `/api/reports/summary/daily?${calendarParams.toString()}` : null,
    []
  );

  async function regenerateSummary() {
    setGenerating(true);
    setMessage(null);
    const requestParams = buildParams(filters);
    try {
      const result = await api<{ records: number; generatedAt: string; periodStart: string; periodEnd: string }>(`/api/reports/summary/generate?${requestParams.toString()}`, { method: "POST" });
      setGeneratedRows(result.records);
      setMessage(`Synthèse régénérée pour ${formatDate(result.periodStart)} - ${formatDate(result.periodEnd)}: ${result.records} jour(s) salarié persisté(s). Le tableau ci-dessous reste regroupé par employé.`);
      await summary.reload();
    } finally {
      setGenerating(false);
    }
  }

  function changePayrollPeriod(monthOffset: number) {
    const currentStart = parseDate(filters.startDate || range.startDate);
    currentStart.setMonth(currentStart.getMonth() + monthOffset);
    const nextStart = new Date(currentStart.getFullYear(), currentStart.getMonth(), 26);
    const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 25);
    update({ startDate: dateKey(nextStart), endDate: dateKey(nextEnd) });
    setMessage(null);
    setGeneratedRows(null);
  }

  const totals = summary.data.reduce(
    (acc, row) => ({
      presentDays: acc.presentDays + row.presentDays,
      absentDays: acc.absentDays + row.absentDays,
      sickDays: acc.sickDays + row.sickDays,
      leaveDays: acc.leaveDays + row.leaveDays,
      accidentDays: acc.accidentDays + row.accidentDays,
      compensatedDays: acc.compensatedDays + row.compensatedDays,
      absenceReversedDays: acc.absenceReversedDays + row.absenceReversedDays,
      restDays: acc.restDays + row.restDays,
      incompleteDays: acc.incompleteDays + row.incompleteDays,
      workedHours: acc.workedHours + row.totalWorkedHours,
      overtime50: acc.overtime50 + row.overtimeHoursRate50,
      overtime75: acc.overtime75 + row.overtimeHoursRate75,
      overtime100: acc.overtime100 + row.overtimeHoursRate100,
      overtime: acc.overtime + row.totalOvertimeHours
    }),
    { presentDays: 0, absentDays: 0, sickDays: 0, leaveDays: 0, accidentDays: 0, compensatedDays: 0, absenceReversedDays: 0, restDays: 0, incompleteDays: 0, workedHours: 0, overtime50: 0, overtime75: 0, overtime100: 0, overtime: 0 }
  );
  const totalDailyRows = totals.presentDays + totals.absentDays + totals.sickDays + totals.leaveDays + totals.accidentDays + totals.compensatedDays + totals.absenceReversedDays + totals.restDays + totals.incompleteDays;
  const lastGeneratedAt = summary.data.reduce<string | null>((latest, row) => {
    if (!latest || row.lastGeneratedAt > latest) return row.lastGeneratedAt;
    return latest;
  }, null);

  return (
    <>
      <PageHeader title="Rapport de synthèse paie" />
      <section className="panel">
        <div className="row-actions">
          <Button variant="secondary" onClick={() => changePayrollPeriod(-1)}>
            <ChevronLeft size={16} /> Période précédente
          </Button>
          <div className="period-chip">
            {formatDate(filters.startDate)} - {formatDate(filters.endDate)}
          </div>
          <Button variant="secondary" onClick={() => changePayrollPeriod(1)}>
            Période suivante <ChevronRight size={16} />
          </Button>
        </div>
        <FiltersBar onReset={reset}>
          <FilterField label="Du"><input type="date" value={filters.startDate} onChange={event => update({ startDate: event.target.value })} /></FilterField>
          <FilterField label="Au"><input type="date" value={filters.endDate} onChange={event => update({ endDate: event.target.value })} /></FilterField>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule..." /></div>
          </FilterField>
          <FilterField label="Unité">
            <select value={filters.unitId} onChange={event => update({ unitId: event.target.value, subUnitId: "", groupId: "" })}>
              <option value="">Toutes</option>
              {orgTree.data.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sous-unité">
            <select value={filters.subUnitId} disabled={!selectedUnit} onChange={event => update({ subUnitId: event.target.value, groupId: "" })}>
              <option value="">Toutes</option>
              {selectedUnit?.subUnits.map(subUnit => <option key={subUnit.id} value={subUnit.id}>{subUnit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Groupe">
            <select value={filters.groupId} disabled={!selectedSubUnit} onChange={event => update({ groupId: event.target.value })}>
              <option value="">Tous</option>
              {selectedSubUnit?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Statut employé">
            <select value={filters.status} onChange={event => update({ status: event.target.value })}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actifs</option>
              <option value="RESIGNED">Démissionnés</option>
            </select>
          </FilterField>
        </FiltersBar>

        <div className="attendance-summary-strip">
          <div><span>Employés affichés</span><strong>{summary.data.length}</strong></div>
          <div><span>Jours synthèse</span><strong>{generatedRows ?? totalDailyRows}</strong></div>
          <div><span>Jours présents</span><strong>{totals.presentDays}</strong></div>
          <div><span>Absences</span><strong>{totals.absentDays}</strong></div>
          <div><span>Maladie</span><strong>{totals.sickDays}</strong></div>
          <div><span>Congé</span><strong>{totals.leaveDays}</strong></div>
          <div><span>Accident</span><strong>{totals.accidentDays}</strong></div>
          <div><span>Sans preuve</span><strong>{totals.absenceReversedDays}</strong></div>
          <div><span>Heures travaillées</span><strong>{totals.workedHours.toFixed(2)} h</strong></div>
          <div><span>Sup. 50%</span><strong>{totals.overtime50.toFixed(2)} h</strong></div>
          <div><span>Sup. 75%</span><strong>{totals.overtime75.toFixed(2)} h</strong></div>
          <div><span>Sup. 100%</span><strong>{totals.overtime100.toFixed(2)} h</strong></div>
          <div><span>Heures sup. total</span><strong>{totals.overtime.toFixed(2)} h</strong></div>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {summary.error && <div className="alert alert-error">Impossible de charger la synthèse persistée: {summary.error}</div>}

        <div className="row-actions">
          <Button variant="primary" onClick={regenerateSummary} disabled={generating}>
            <RefreshCw size={16} /> {generating ? "Génération..." : "Régénérer la période"}
          </Button>
          <ExportButtons excelUrl={fileUrl("/api/reports/summary/export/excel", params)} pdfUrl={fileUrl("/api/reports/summary/export/pdf", params)} />
          {lastGeneratedAt && <span className="muted">Dernière génération: {new Date(lastGeneratedAt).toLocaleString("fr-FR")}</span>}
        </div>
        <AttendanceStatusLegend />

        <DataTable
          rows={summary.data}
          loading={summary.loading || orgTree.loading}
          loadingLabel="Chargement de la synthèse persistée..."
          pageSize={50}
          empty="Aucune synthèse générée pour cette période. Cliquez sur Régénérer."
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>, sortValue: row => row.employee.fullName },
            { key: "org", header: "Organigramme", render: row => [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-", sortValue: row => `${row.employee.unitName || ""}${row.employee.subUnitName || ""}${row.employee.groupName || ""}` },
            { key: "present", header: "Présents", render: row => row.presentDays, sortValue: row => row.presentDays },
            { key: "absent", header: "Absents", render: row => row.absentDays, sortValue: row => row.absentDays },
            { key: "sick", header: "Maladie", render: row => row.sickDays, sortValue: row => row.sickDays },
            { key: "leave", header: "Congé", render: row => row.leaveDays, sortValue: row => row.leaveDays },
            { key: "accident", header: "Accident", render: row => row.accidentDays, sortValue: row => row.accidentDays },
            { key: "comp", header: "Compensés", render: row => row.compensatedDays, sortValue: row => row.compensatedDays },
            { key: "reversed", header: "Sans preuve", render: row => row.absenceReversedDays, sortValue: row => row.absenceReversedDays },
            { key: "rest", header: "Repos", render: row => row.restDays, sortValue: row => row.restDays },
            { key: "inc", header: "Incomplets", render: row => row.incompleteDays, sortValue: row => row.incompleteDays },
            { key: "hours", header: "Heures", render: row => `${row.totalWorkedHours} h`, sortValue: row => row.totalWorkedHours },
            { key: "ot50", header: "Sup. 50%", render: row => `${row.overtimeHoursRate50} h`, sortValue: row => row.overtimeHoursRate50 },
            { key: "ot75", header: "Sup. 75%", render: row => `${row.overtimeHoursRate75} h`, sortValue: row => row.overtimeHoursRate75 },
            { key: "ot100", header: "Sup. 100%", render: row => `${row.overtimeHoursRate100} h`, sortValue: row => row.overtimeHoursRate100 },
            { key: "ot", header: "Total sup.", render: row => `${row.totalOvertimeHours} h`, sortValue: row => row.totalOvertimeHours },
            { key: "calendar", header: "Calendrier", render: row => (
              <Button variant="ghost" onClick={() => setCalendarEmployee(row.employee)}>
                <CalendarDays size={16} /> Voir
              </Button>
            ) },
            { key: "period", header: "Période analysée", render: () => `${formatDate(filters.startDate)} - ${formatDate(filters.endDate)}`, sortValue: () => `${filters.startDate}${filters.endDate}` },
          ]}
        />
      </section>
      {calendarEmployee && (
        <div className="modal-backdrop">
          <div className="calendar-modal wide-modal">
            <div className="modal-header">
              <div>
                <span>Calendrier pointages</span>
                <strong>{calendarEmployee.fullName}</strong>
                <small className="muted">{formatDate(filters.startDate)} - {formatDate(filters.endDate)}</small>
              </div>
              <button className="icon-button" onClick={() => setCalendarEmployee(null)} title="Fermer"><X size={18} /></button>
            </div>
            {calendarRows.loading && <LoadingState label="Chargement du calendrier pointages..." />}
            {!calendarRows.loading && <SummaryPunchCalendar rows={calendarRows.data} startDate={filters.startDate} endDate={filters.endDate} />}
          </div>
        </div>
      )}
    </>
  );
}

function SummaryPunchCalendar({ rows, startDate, endDate }: { rows: SummaryDailyRecordRow[]; startDate: string; endDate: string }) {
  const byDate = new Map(rows.map(row => [row.workDate, row]));
  const totals = rows.reduce(
    (acc, row) => ({
      complete: acc.complete + (row.status === "PRESENT" || row.status === "COMPENSATED" ? 1 : 0),
      incomplete: acc.incomplete + (row.status === "INCOMPLETE" ? 1 : 0),
      absent: acc.absent + (row.status === "ABSENT" ? 1 : 0),
      sick: acc.sick + (row.status === "SICK" ? 1 : 0),
      accident: acc.accident + (row.status === "ACCIDENT" ? 1 : 0),
      leave: acc.leave + (row.status === "LEAVE" ? 1 : 0),
      reversed: acc.reversed + (row.status === "ABSENCE_REVERSED" ? 1 : 0),
      repos: acc.repos + (row.status === "REST" ? 1 : 0),
      hours: acc.hours + row.workedHours
    }),
    { complete: 0, incomplete: 0, absent: 0, sick: 0, leave: 0, accident: 0, reversed: 0, repos: 0, hours: 0 }
  );

  return (
    <>
      <div className="attendance-summary-strip compact">
        <div><span>Complet</span><strong>{totals.complete}</strong></div>
        <div><span>Incomplet</span><strong>{totals.incomplete}</strong></div>
        <div><span>Absent</span><strong>{totals.absent}</strong></div>
        <div><span>Maladie</span><strong>{totals.sick}</strong></div>
        <div><span>Congé</span><strong>{totals.leave}</strong></div>
        <div><span>Accident</span><strong>{totals.accident}</strong></div>
        <div><span>Sans preuve</span><strong>{totals.reversed}</strong></div>
        <div><span>Repos</span><strong>{totals.repos}</strong></div>
        <div><span>Heures</span><strong>{totals.hours.toFixed(2)} h</strong></div>
      </div>
      <AttendanceStatusLegend />
      <div className="period-calendar report-calendar">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="calendar-head">{day}</div>)}
        {buildDateCells(startDate, endDate).map(cell => {
          if (!cell.date) return <div key={cell.key} className="calendar-day calendar-empty" />;
          const row = byDate.get(cell.date);
          const shift = row?.shiftType || null;
          const leaveDetail = row?.status === "LEAVE" && row.leaveType ? `Congé ${leaveTypeLabel(row.leaveType)}${row.exceptionalReason ? ` - ${exceptionalReasonLabel(row.exceptionalReason)}` : ""}` : undefined;
          return (
            <div key={cell.date} title={leaveDetail} className={`calendar-day planner-day ${shift ? `calendar-${shift.toLowerCase()}` : ""} report-status-${attendanceStatusClass(row?.status)}`}>
              <strong>{cell.day}</strong>
              <small>{cell.month}</small>
              {shift && <span className={`shift-badge shift-badge-${shift.toLowerCase()}`}>{shiftLabel(shift)}</span>}
              {leaveDetail && <small>{leaveDetail}</small>}
              {row && row.overtimeHours > 0 && <span>Sup: <b>{row.overtimeHours} h</b></span>}
              <span>Heures: <b>{row ? `${row.workedHours} h` : "-"}</b></span>
              <AttendanceStatusBadge status={row?.status || "EMPTY"} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function currentPayrollPeriod() {
  const today = new Date();
  const startDay = 26;
  const end = today.getDate() >= startDay
    ? new Date(today.getFullYear(), today.getMonth() + 1, startDay - 1)
    : new Date(today.getFullYear(), today.getMonth(), startDay - 1);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, startDay);
  return { startDate: dateKey(start), endDate: dateKey(end) };
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value: string) {
  return parseDate(value).toLocaleDateString("fr-FR");
}

function buildParams(filters: Record<string, string>) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
}

function buildDateCells(startDate: string, endDate: string) {
  const first = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const formatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const cells = Array.from({ length: (first.getDay() + 6) % 7 }, (_, index) => ({ key: `empty-${index}`, date: null as string | null, day: "", month: "" }));
  for (let cursor = new Date(first); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    cells.push({ key: dateKey(cursor), date: dateKey(cursor), day: String(cursor.getDate()).padStart(2, "0"), month: formatter.format(cursor) });
  }
  return cells;
}

function leaveTypeLabel(value: string) {
  if (value === "EXCEPTIONNEL") return "exceptionnel";
  if (value === "SANS_SOLDE") return "sans solde";
  if (value === "MATERNITE") return "maternité";
  return "annuel";
}

function exceptionalReasonLabel(value: string) {
  const labels: Record<string, string> = {
    MARIAGE_EMPLOYE: "mariage employé",
    NAISSANCE_ENFANT: "naissance enfant",
    MARIAGE_ENFANT: "mariage descendant",
    DECES_CONJOINT: "décès conjoint",
    DECES_PARENT_PROCHE: "décès parent proche",
    CIRCONCISION_FILS: "circoncision fils",
    HAJJ: "Hajj"
  };
  return labels[value] || value;
}
