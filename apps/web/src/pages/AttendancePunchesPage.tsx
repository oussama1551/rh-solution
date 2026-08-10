import { CalendarDays, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { EmployeeMonthlyCalendarModal } from "../components/EmployeeMonthlyCalendarModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { shiftLabels, timingLabels } from "../lib/shiftLabels";
import { AttendanceDailyRow, AttendanceTiming, OrgUnit } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

function currentMonth() {
  const today = new Date();
  const label = today.getDate() >= 26 ? new Date(today.getFullYear(), today.getMonth() + 1, 1) : today;
  return `${label.getFullYear()}-${String(label.getMonth() + 1).padStart(2, "0")}`;
}

function payrollPeriod(month: string) {
  const [year, monthNumber] = month.split("-").map(Number);
  const end = new Date(year, monthNumber - 1, 25);
  const start = new Date(year, monthNumber - 2, 26);

  return {
    from: dateKey(start),
    to: dateKey(end)
  };
}

function buildQuery(filters: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters.search) params.set("search", filters.search);
  if (filters.department) params.set("department", filters.department);
  if (filters.employeeStatus) params.set("employeeStatus", filters.employeeStatus);
  if (filters.timing) params.set("timing", filters.timing);
  if (filters.shiftType) params.set("shiftType", filters.shiftType);
  if (filters.groupId) params.set("groupId", filters.groupId);
  else if (filters.subUnitId) params.set("subUnitId", filters.subUnitId);
  else if (filters.unitId) params.set("unitId", filters.unitId);
  const month = filters.month || currentMonth();
  const period = payrollPeriod(month);
  params.set("month", month);
  params.set("from", `${period.from}T${validTime(filters.fromTime, "00:00")}:00`);
  params.set("to", `${period.to}T${validTime(filters.toTime, "23:59")}:59`);
  return `/api/attendance/daily?${params.toString()}`;
}

function validTime(value: string | undefined, fallback: string) {
  return value && /^([01]\d|2[0-3]):[0-5]\d$/.test(value) ? value : fallback;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR");
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

function timingBadge(timing: AttendanceTiming) {
  const value = timing === "NIGHT" ? "RUNNING" : timing === "EVENING" ? "PENDING" : timing === "NORMAL" ? "VALIDATED" : "UNKNOWN";
  return <StatusBadge value={value} label={timingLabels[timing]} />;
}

function hoursLabel(value: number) {
  const hours = Math.floor(value);
  const minutes = Math.round((value - hours) * 60);
  return `${hours}h ${String(minutes).padStart(2, "0")}m`;
}

function dateKey(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function periodLabel(month: string) {
  const period = payrollPeriod(month);
  return `${formatDate(period.from)} - ${formatDate(period.to)}`;
}

export function AttendancePunchesPage() {
  const { filters, update, reset } = useSessionFilters("attendance.daily.filters", {
    search: "",
    department: "",
    employeeStatus: "",
    timing: "",
    shiftType: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    firstLastOnly: "true",
    month: currentMonth(),
    fromTime: "00:00",
    toTime: "23:59"
  });
  const [selectedEmployee, setSelectedEmployee] = useState<{ id: string; name: string } | null>(null);
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const rows = useApi<AttendanceDailyRow[]>(buildQuery(filters), []);

  const totals = useMemo(() => ({
    days: rows.data.length,
    hours: rows.data.reduce((sum, row) => sum + row.workedHours, 0),
    night: rows.data.filter(row => row.timing === "NIGHT").length,
    incomplete: rows.data.filter(row => row.isIncomplete).length,
    morning: rows.data.filter(row => row.shiftType === "MORNING" || row.shiftType === "SEC_MORNING").length,
    evening: rows.data.filter(row => row.shiftType === "EVENING").length,
    flexible: rows.data.filter(row => row.shiftType === "FLEXIBLE").length
  }), [rows.data]);
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;

  return (
    <>
      <PageHeader title="Pointages journaliers" />
      <section className="panel">
        <div className="attendance-summary-strip">
          <div><span>Jours affichés</span><strong>{totals.days}</strong></div>
          <div><span>Total heures</span><strong>{hoursLabel(totals.hours)}</strong></div>
          <div><span>Matin / Soir</span><strong>{totals.morning} / {totals.evening}</strong></div>
          <div><span>Nuit / Normal</span><strong>{totals.night} / {totals.flexible}</strong></div>
          <div><span>Jours incomplets</span><strong>{totals.incomplete}</strong></div>
        </div>
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche">
            <div className="input-icon">
              <Search size={15} />
              <input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule SAP, code BioTime..." />
            </div>
          </FilterField>
          <FilterField label="Mois">
            <div className="stack-cell">
              <input type="month" value={filters.month} onChange={event => update({ month: event.target.value })} />
              <span>Période {periodLabel(filters.month || currentMonth())}</span>
            </div>
          </FilterField>
          <FilterField label="Heure début">
            <div className="time-filter-pair">
              <input className="time24-input" value={filters.fromTime} onChange={event => update({ fromTime: event.target.value })} placeholder="00:00" inputMode="numeric" maxLength={5} />
            </div>
          </FilterField>
          <FilterField label="Heure fin">
            <div className="time-filter-pair">
              <input className="time24-input" value={filters.toTime} onChange={event => update({ toTime: event.target.value })} placeholder="23:59" inputMode="numeric" maxLength={5} />
            </div>
          </FilterField>
          <FilterField label="Département">
            <input value={filters.department} onChange={event => update({ department: event.target.value })} placeholder="Production, RH..." />
          </FilterField>
          <FilterField label="Timing">
            <select value={filters.shiftType} onChange={event => update({ shiftType: event.target.value })}>
              <option value="">Tous</option>
              <option value="MORNING">{shiftLabels.MORNING}</option>
              <option value="EVENING">{shiftLabels.EVENING}</option>
              <option value="NIGHT">{shiftLabels.NIGHT}</option>
              <option value="FLEXIBLE">{shiftLabels.FLEXIBLE}</option>
              <option value="SEC_MORNING">{shiftLabels.SEC_MORNING}</option>
              <option value="SEC_NIGHT">{shiftLabels.SEC_NIGHT}</option>
            </select>
          </FilterField>
          <FilterField label="Unité">
            <select value={filters.unitId} onChange={event => update({ unitId: event.target.value, subUnitId: "", groupId: "" })}>
              <option value="">Toutes</option>
              {orgTree.data.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sous-unité">
            <select value={filters.subUnitId} onChange={event => update({ subUnitId: event.target.value, groupId: "" })} disabled={!selectedUnit}>
              <option value="">Toutes</option>
              {selectedUnit?.subUnits.map(subUnit => <option key={subUnit.id} value={subUnit.id}>{subUnit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Groupe">
            <select value={filters.groupId} onChange={event => update({ groupId: event.target.value })} disabled={!selectedSubUnit}>
              <option value="">Tous</option>
              {selectedSubUnit?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Employé">
            <select value={filters.employeeStatus} onChange={event => update({ employeeStatus: event.target.value })}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actifs</option>
              <option value="RESIGNED">Démissionnés</option>
            </select>
          </FilterField>
          <FilterField label="Affichage">
            <label className="checkbox-inline">
              <input type="checkbox" checked={filters.firstLastOnly === "true"} onChange={event => update({ firstLastOnly: event.target.checked ? "true" : "false" })} />
              Premier / dernier
            </label>
          </FilterField>
        </FiltersBar>
        {rows.error && <div className="alert alert-error">Impossible de charger les pointages journaliers.</div>}
        <DataTable
          rows={rows.data}
          loading={rows.loading || orgTree.loading}
          loadingLabel="Chargement des pointages..."
          empty="Aucun pointage trouvé."
          pageSize={31}
          columns={[
            { key: "date", header: "Jour", render: row => formatDate(row.workDate), sortValue: row => row.workDate },
            { key: "employee", header: "Employé", render: row => (
              <button className="link-cell" onClick={() => setSelectedEmployee({ id: row.employee.id, name: row.employee.fullName })}>
                <strong>{row.employee.fullName}</strong>
                <span>{row.employee.displayMatricule}</span>
              </button>
            ), sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "first", header: "Premier punch", render: row => (
              <div className="table-main-cell"><strong>{formatTime(row.firstPunchTime)}</strong><span>{row.firstPunchId || "-"}</span></div>
            ), sortValue: row => row.firstPunchTime || "" },
            { key: "last", header: "Dernier punch", render: row => (
              <div className="table-main-cell"><strong>{formatTime(row.lastPunchTime)}</strong><span>{row.lastPunchId || "-"}</span></div>
            ), sortValue: row => row.lastPunchTime || "" },
            { key: "hours", header: "Heures", render: row => row.isIncomplete ? <StatusBadge value="REJECTED" label="Incomplet" /> : hoursLabel(row.workedHours), sortValue: row => row.workedHours },
            { key: "timing", header: "Shift", render: row => (
              <div className="table-main-cell">
                {timingBadge(row.timing)}
                <span>{row.assignmentSource === "assigned" ? row.assignedVia === "group" ? `Assigné groupe${row.sourceGroupName ? `: ${row.sourceGroupName}` : ""}` : "Assigné individuel" : "Déduit automatiquement"}</span>
              </div>
            ), sortValue: row => row.shiftType },
            { key: "count", header: "Punches", render: row => row.punchCount, sortValue: row => row.punchCount },
            { key: "device", header: "Terminal", render: row => row.sourceDevice || "-", sortValue: row => row.sourceDevice || "" },
            { key: "calendar", header: "Mois", render: row => (
              <Button variant="ghost" onClick={() => setSelectedEmployee({ id: row.employee.id, name: row.employee.fullName })}>
                <CalendarDays size={16} /> Voir
              </Button>
            ) }
          ]}
        />
      </section>
      <EmployeeMonthlyCalendarModal employee={selectedEmployee} month={filters.month || currentMonth()} onClose={() => setSelectedEmployee(null)} />
    </>
  );
}
