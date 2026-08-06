import { CalendarDays, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { DataTable } from "../components/DataTable";
import { Button } from "../components/Button";
import { ExportButtons } from "../components/ExportButtons";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { shiftLabel } from "../lib/shiftLabels";
import { Employee, OrgUnit, PointagePlanningReportRow, SummaryReportRow } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";
import { api, fileUrl } from "../lib/api";

export function ReportsPage() {
  const range = currentPayrollPeriod();
  const { filters, update, reset } = useSessionFilters("reports.pointages.filters", {
    startDate: range.startDate,
    endDate: range.endDate,
    search: "",
    employeeId: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    status: "ACTIVE"
  });
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const employees = useApi<Employee[]>("/api/employees", []);
  const [view, setView] = useState<"table" | "planning" | "summary">("planning");
  const [summaryMessage, setSummaryMessage] = useState<string | null>(null);
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;
  const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
  const rows = useApi<PointagePlanningReportRow[]>(`/api/reports/pointages/planning?${params.toString()}`, []);
  const summary = useApi<SummaryReportRow[]>(`/api/reports/summary?${params.toString()}`, []);
  const selectedEmployee = employees.data.find(employee => employee.id === filters.employeeId) || null;
  const planningGroups = useMemo(() => groupRowsByEmployee(rows.data, employees.data), [rows.data, employees.data]);
  const summaryParams = new URLSearchParams(params);

  async function regenerateSummary() {
    setSummaryMessage(null);
    const result = await api<{ records: number; generatedAt: string }>(`/api/reports/summary/generate?${summaryParams.toString()}`, { method: "POST" });
    setSummaryMessage(`Synthèse régénérée: ${result.records} ligne(s).`);
    summary.reload();
  }

  return (
    <>
      <PageHeader title="Rapport pointages & planning" />
      <section className="panel">
        <FiltersBar onReset={reset}>
          <FilterField label="Du"><input type="date" value={filters.startDate} onChange={event => update({ startDate: event.target.value })} /></FilterField>
          <FilterField label="Au"><input type="date" value={filters.endDate} onChange={event => update({ endDate: event.target.value })} /></FilterField>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule..." /></div>
          </FilterField>
          <FilterField label="Employé">
            <select value={filters.employeeId} onChange={event => update({ employeeId: event.target.value, groupId: event.target.value ? "" : filters.groupId })}>
              <option value="">Tous</option>
              {employees.data.map(employee => <option key={employee.id} value={employee.id}>{employee.localMatricule || employee.biotimeCode || employee.employeeCode} - {employee.fullName}</option>)}
            </select>
          </FilterField>
          <FilterField label="Unité">
            <select value={filters.unitId} onChange={event => update({ unitId: event.target.value, subUnitId: "", groupId: "", employeeId: "" })}>
              <option value="">Toutes</option>
              {orgTree.data.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sous-unité">
            <select value={filters.subUnitId} disabled={!selectedUnit} onChange={event => update({ subUnitId: event.target.value, groupId: "", employeeId: "" })}>
              <option value="">Toutes</option>
              {selectedUnit?.subUnits.map(subUnit => <option key={subUnit.id} value={subUnit.id}>{subUnit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Groupe">
            <select value={filters.groupId} disabled={!selectedSubUnit} onChange={event => update({ groupId: event.target.value, employeeId: "" })}>
              <option value="">Tous</option>
              {selectedSubUnit?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Statut">
            <select value={filters.status} onChange={event => update({ status: event.target.value })}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actifs</option>
              <option value="RESIGNED">Démissionnés</option>
            </select>
          </FilterField>
        </FiltersBar>

        <div className="attendance-summary-strip">
          <div><span>Lignes</span><strong>{rows.data.length}</strong></div>
          <div><span>Présences complètes</span><strong>{rows.data.filter(row => row.serviceStatus === "complete").length}</strong></div>
          <div><span>Incomplets</span><strong>{rows.data.filter(row => row.serviceStatus === "incomplete").length}</strong></div>
          <div><span>Absents</span><strong>{rows.data.filter(row => row.serviceStatus === "absent").length}</strong></div>
        </div>

        <div className="tabs">
          <button className={view === "planning" ? "active" : ""} onClick={() => setView("planning")}>Vue planning</button>
          <button className={view === "table" ? "active" : ""} onClick={() => setView("table")}>Tableau transactions</button>
          <button className={view === "summary" ? "active" : ""} onClick={() => setView("summary")}>Synthèse paie</button>
        </div>

        {view === "summary" ? (
          <div className="stack">
            {summaryMessage && <div className="alert alert-success">{summaryMessage}</div>}
            <div className="row-actions">
              <Button variant="primary" onClick={regenerateSummary}><RefreshCw size={16} /> Régénérer la période</Button>
              <ExportButtons excelUrl={fileUrl("/api/reports/summary/export/excel", summaryParams)} pdfUrl={fileUrl("/api/reports/summary/export/pdf", summaryParams)} />
            </div>
            <DataTable
              rows={summary.data}
              loading={summary.loading || employees.loading || orgTree.loading}
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
                { key: "comp", header: "Comp.", render: row => row.compensatedDays, sortValue: row => row.compensatedDays },
                { key: "reversed", header: "Sans preuve", render: row => row.absenceReversedDays, sortValue: row => row.absenceReversedDays },
                { key: "rest", header: "Repos", render: row => row.restDays, sortValue: row => row.restDays },
                { key: "inc", header: "Incomplets", render: row => row.incompleteDays, sortValue: row => row.incompleteDays },
                { key: "hours", header: "Heures", render: row => `${row.totalWorkedHours} h`, sortValue: row => row.totalWorkedHours },
                { key: "ot50", header: "Sup. 50%", render: row => `${row.overtimeHoursRate50} h`, sortValue: row => row.overtimeHoursRate50 },
                { key: "ot75", header: "Sup. 75%", render: row => `${row.overtimeHoursRate75} h`, sortValue: row => row.overtimeHoursRate75 },
                { key: "ot100", header: "Sup. 100%", render: row => `${row.overtimeHoursRate100} h`, sortValue: row => row.overtimeHoursRate100 },
                { key: "ot", header: "Total sup.", render: row => `${row.totalOvertimeHours} h`, sortValue: row => row.totalOvertimeHours },
                { key: "generated", header: "Généré", render: row => new Date(row.lastGeneratedAt).toLocaleString("fr-FR"), sortValue: row => row.lastGeneratedAt }
              ]}
            />
          </div>
        ) : view === "planning" ? (
          <div className="report-planning-stack">
            {rows.loading && <LoadingState label="Chargement de la vue planning..." />}
            {planningGroups.length === 0 && <div className="empty-state">Aucun planning ou pointage trouvé.</div>}
            {planningGroups.map(group => (
              <PointagePlanningCalendar key={group.employee.id} employee={group.employee} rows={group.rows} startDate={filters.startDate} endDate={filters.endDate} compact={!selectedEmployee && planningGroups.length > 1} />
            ))}
          </div>
        ) : (
          <DataTable
            rows={rows.data}
            loading={rows.loading || employees.loading || orgTree.loading}
            loadingLabel="Chargement des transactions..."
            pageSize={50}
            empty="Aucun pointage ou planning trouvé."
            columns={[
              { key: "date", header: "Date", render: row => formatDate(row.workDate), sortValue: row => row.workDate },
              { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>, sortValue: row => row.employee.fullName },
              { key: "org", header: "Organigramme", render: row => `${row.employee.unitName || "-"} > ${row.employee.subUnitName || "-"} > ${row.employee.groupName || "-"}`, sortValue: row => `${row.employee.unitName || ""}${row.employee.subUnitName || ""}${row.employee.groupName || ""}` },
              { key: "shift", header: "Planning", render: row => <PlanningBadge row={row} />, sortValue: row => row.plannedShiftType || "" },
              { key: "entry", header: "Entrée", render: row => formatTime(row.firstPunchTime), sortValue: row => row.firstPunchTime || "" },
              { key: "exit", header: "Sortie", render: row => formatTime(row.lastPunchTime), sortValue: row => row.lastPunchTime || "" },
              { key: "hours", header: "Heures", render: row => row.workedHours ? `${row.workedHours} h` : "-", sortValue: row => row.workedHours },
              { key: "count", header: "Punches", render: row => row.punchCount, sortValue: row => row.punchCount },
              { key: "status", header: "État", render: row => <StatusBadge value={statusBadgeValue(row.serviceStatus)} label={statusLabel(row.serviceStatus)} />, sortValue: row => row.serviceStatus }
            ]}
          />
        )}
      </section>
    </>
  );
}

function PointagePlanningCalendar({ employee, rows, startDate, endDate, compact = false }: { employee: Employee; rows: PointagePlanningReportRow[]; startDate: string; endDate: string; compact?: boolean }) {
  const byDate = new Map(rows.map(row => [row.workDate, row]));
  return (
    <div className={`report-calendar-panel ${compact ? "compact" : ""}`}>
      <div className="panel-header">
        <div>
          <h2><CalendarDays size={18} /> {employee.fullName}</h2>
          <span className="muted">{formatDate(startDate)} - {formatDate(endDate)}</span>
        </div>
      </div>
      <div className="period-calendar report-calendar">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="calendar-head">{day}</div>)}
        {buildDateCells(startDate, endDate).map(cell => {
          if (!cell.date) return <div key={cell.key} className="calendar-day calendar-empty" />;
          const row = byDate.get(cell.date);
          const shift = row?.plannedShiftType || null;
          return (
            <div key={cell.date} className={`calendar-day planner-day ${shift ? `calendar-${shift.toLowerCase()}` : ""} report-status-${row?.serviceStatus || "empty"}`}>
              <strong>{cell.day}</strong>
              <small>{cell.month}</small>
              {shift && <span className={`shift-badge shift-badge-${shift.toLowerCase()}`}>{shiftLabel(shift, row?.plannedShiftLabel)}</span>}
              <span>Présence: <b>{formatTime(row?.firstPunchTime || null)} → {formatTime(row?.lastPunchTime || null)}</b></span>
              <small>{row ? statusLabel(row.serviceStatus) : "Aucun planning"}</small>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function groupRowsByEmployee(rows: PointagePlanningReportRow[], employees: Employee[]) {
  const employeeById = new Map(employees.map(employee => [employee.id, employee]));
  const groups = new Map<string, { employee: Employee; rows: PointagePlanningReportRow[] }>();
  for (const row of rows) {
    const fallbackEmployee: Employee = {
      id: row.employee.id,
      zktecoId: "",
      employeeCode: row.employee.sourceCode,
      biotimeCode: row.employee.sourceCode,
      localMatricule: row.employee.code,
      fullName: row.employee.fullName,
      department: row.employee.department,
      status: row.employee.status
    };
    const employee = employeeById.get(row.employee.id) || fallbackEmployee;
    const existing = groups.get(row.employee.id) || { employee, rows: [] };
    existing.rows.push(row);
    groups.set(row.employee.id, existing);
  }
  return [...groups.values()].sort((left, right) => left.employee.fullName.localeCompare(right.employee.fullName));
}

function PlanningBadge({ row }: { row: PointagePlanningReportRow }) {
  if (!row.plannedShiftType) return <span className="muted">Non planifié</span>;
  return (
    <div className="stack-cell">
      <span className={`shift-badge shift-badge-${row.plannedShiftType.toLowerCase()}`}>{shiftLabel(row.plannedShiftType, row.plannedShiftLabel)}</span>
      <small>{row.planningSource === "assigned" ? row.assignedVia === "group" ? `Assigné groupe${row.sourceGroupName ? `: ${row.sourceGroupName}` : ""}` : "Assigné individuel" : "Déduit par pointage"}</small>
    </div>
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

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR");
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function statusLabel(value: PointagePlanningReportRow["serviceStatus"]) {
  if (value === "complete") return "Complet";
  if (value === "incomplete") return "Incomplet";
  if (value === "absent") return "Absent";
  if (value === "repos") return "Repos";
  return "Vide";
}

function statusBadgeValue(value: PointagePlanningReportRow["serviceStatus"]) {
  if (value === "complete") return "ACTIVE";
  if (value === "incomplete") return "PENDING";
  if (value === "absent") return "RESIGNED";
  if (value === "repos") return "PENDING";
  return "UNKNOWN";
}
