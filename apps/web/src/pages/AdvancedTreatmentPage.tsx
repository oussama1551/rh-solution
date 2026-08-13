import { CalendarDays, Check, Download, Printer, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { api, fileUrl } from "../lib/api";
import { AdvancedTreatmentCalendar, AdvancedTreatmentResponse, AdvancedTreatmentRiskLevel, AdvancedTreatmentRow, OrgUnit } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

const DEFAULT_START = "2026-07-26";
const DEFAULT_END = "2026-08-14";

export function AdvancedTreatmentPage() {
  const { filters, update, reset } = useSessionFilters("advanced.treatment.filters", {
    startDate: DEFAULT_START,
    endDate: DEFAULT_END,
    search: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    riskLevel: "",
    netPay: "10000"
  });
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;
  const params = useMemo(() => buildParams(filters), [filters]);
  const analysis = useApi<AdvancedTreatmentResponse>(`/api/advanced-treatment?${params.toString()}`, {
    periodStart: filters.startDate,
    periodEnd: filters.endDate,
    rows: [],
    stats: {
      total: 0,
      confirmed: 0,
      frozen: 0,
      missingBankAccount: 0,
      high: 0,
      medium: 0,
      low: 0,
      confirmedByCompany: { FABCOM: 0, RECYCLAGE: 0, NEWTECH: 0, OTHER: 0 }
    }
  });
  const [calendarEmployee, setCalendarEmployee] = useState<{ id: string; name: string } | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [refreshingSap, setRefreshingSap] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function confirm(row: AdvancedTreatmentRow) {
    setBusyId(row.employee.id);
    setMessage(null);
    try {
      await api(`/api/advanced-treatment/${row.employee.id}/confirm?${params.toString()}`, { method: "POST", body: JSON.stringify({}) });
      setMessage(`${row.employee.fullName} confirmé pour la période.`);
      await analysis.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function unconfirm(row: AdvancedTreatmentRow) {
    setBusyId(row.employee.id);
    setMessage(null);
    try {
      await api(`/api/advanced-treatment/${row.employee.id}/confirm?${params.toString()}`, { method: "DELETE" });
      setMessage(`Confirmation retirée pour ${row.employee.fullName}.`);
      await analysis.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function refreshSapAccounts() {
    setRefreshingSap(true);
    setMessage(null);
    try {
      const result = await api<{ before: number; after: number; refreshed: number; linked: number }>("/api/advanced-treatment/refresh-sap-accounts", { method: "POST" });
      setMessage(`Comptes SAP actualisés: ${result.after} compte(s) disponible(s) après refresh (${result.refreshed} lignes SAP lues).`);
      await analysis.reload();
    } finally {
      setRefreshingSap(false);
    }
  }

  async function freeze(row: AdvancedTreatmentRow) {
    setBusyId(row.employee.id);
    setMessage(null);
    try {
      await api(`/api/advanced-treatment/${row.employee.id}/freeze?${params.toString()}`, { method: "POST", body: JSON.stringify({ reason: "Retiré de la liste de tri" }) });
      setMessage(`${row.employee.fullName} gelé et déplacé en bas de la liste.`);
      await analysis.reload();
    } finally {
      setBusyId(null);
    }
  }

  async function unfreeze(row: AdvancedTreatmentRow) {
    setBusyId(row.employee.id);
    setMessage(null);
    try {
      await api(`/api/advanced-treatment/${row.employee.id}/freeze?${params.toString()}`, { method: "DELETE" });
      setMessage(`${row.employee.fullName} restauré dans la liste.`);
      await analysis.reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader title="Traitement avance" />
      <section className="panel">
        {message && <div className="alert alert-success">{message}</div>}
        {analysis.error && <div className="alert alert-error">Impossible de charger le traitement avance: {analysis.error}</div>}

        <FiltersBar onReset={() => reset()}>
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
          <FilterField label="Niveau">
            <select value={filters.riskLevel} onChange={event => update({ riskLevel: event.target.value })}>
              <option value="">Tous</option>
              <option value="HIGH">Risque très élevé</option>
              <option value="MEDIUM">Risque moyen</option>
              <option value="LOW">Besoin de confirmation</option>
            </select>
          </FilterField>
          <FilterField label="Net à payer">
            <input type="number" min="0" step="100" value={filters.netPay} onChange={event => update({ netPay: event.target.value })} />
          </FilterField>
        </FiltersBar>

        <div className="attendance-summary-strip compact">
          <div><span>Employés affichés</span><strong>{analysis.data.stats.total}</strong></div>
          <div><span>Confirmés</span><strong>{analysis.data.stats.confirmed}</strong></div>
          <div><span>Sans compte</span><strong>{analysis.data.stats.missingBankAccount}</strong></div>
          <div><span>Gelés</span><strong>{analysis.data.stats.frozen}</strong></div>
          <div><span>Risque très élevé</span><strong>{analysis.data.stats.high}</strong></div>
          <div><span>Risque moyen</span><strong>{analysis.data.stats.medium}</strong></div>
          <div><span>Besoin confirmation</span><strong>{analysis.data.stats.low}</strong></div>
          <div><span>Acceptés FABCOM</span><strong>{analysis.data.stats.confirmedByCompany.FABCOM}</strong></div>
          <div><span>Acceptés RECYCLAGE</span><strong>{analysis.data.stats.confirmedByCompany.RECYCLAGE}</strong></div>
          <div><span>Acceptés NEWTECH</span><strong>{analysis.data.stats.confirmedByCompany.NEWTECH}</strong></div>
        </div>

        <div className="row-actions">
          <Button variant="secondary" onClick={analysis.reload}><RefreshCw size={16} /> Actualiser</Button>
          <Button variant="secondary" onClick={refreshSapAccounts} disabled={refreshingSap}>
            <RefreshCw size={16} /> {refreshingSap ? "SAP..." : "Actualiser comptes SAP"}
          </Button>
          <a className="btn btn-secondary" href={fileUrl("/api/advanced-treatment/export/excel", params)}><Download size={16} /> Excel confirmés</a>
          {["FABCOM", "RECYCLAGE", "NEWTECH"].map(company => (
            <a key={company} className="btn btn-secondary" href={fileUrl("/api/advanced-treatment/export/excel", withCompany(params, company))}>
              <Download size={16} /> Excel {company}
            </a>
          ))}
          <a className="btn btn-secondary" href={fileUrl("/api/advanced-treatment/export/frozen/excel", params)}><Download size={16} /> Excel refusés</a>
          <span className="muted">Période par défaut fixe, modifiable: {formatDate(filters.startDate)} - {formatDate(filters.endDate)}</span>
        </div>

        <DataTable
          rows={analysis.data.rows}
          loading={analysis.loading || orgTree.loading}
          loadingLabel="Analyse du traitement avance..."
          empty="Aucun employé avec 6 mois ou plus trouvé pour cette période."
          pageSize={50}
          rowClassName={row => [
            !row.bankAccount ? "advanced-missing-bank-row" : "",
            row.frozen ? "advanced-frozen-row" : ""
          ].filter(Boolean).join(" ")}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>, sortValue: row => row.employee.fullName },
            { key: "hire", header: "Embauche", render: row => row.employee.hireDate ? formatDate(row.employee.hireDate) : "-", sortValue: row => row.employee.hireDate || "" },
            { key: "months", header: "Ancienneté", render: row => `${row.seniorityMonths} mois`, sortValue: row => row.seniorityMonths },
            { key: "bank", header: "Compte bancaire", render: row => row.bankAccount || "-", sortValue: row => row.bankAccount || "" },
            { key: "punches", header: "Pointés", render: row => row.punchedDays, sortValue: row => row.punchedDays },
            { key: "empty", header: "Jours vides", render: row => row.emptyDays, sortValue: row => row.emptyDays },
            { key: "justified", header: "Maladie/Congé", render: row => (
              <div className={`table-main-cell ${row.justifiedDays > 0 ? "advanced-justified-cell" : ""}`}>
                <strong>{row.justifiedDays}</strong>
                <span>Maladie {row.sickDays} · Congé {row.leaveDays}</span>
                {row.justifiedDays > 0 && <span className="justified-note">À vérifier avant confirmation</span>}
              </div>
            ), sortValue: row => row.justifiedDays },
            { key: "risk", header: "Analyse", render: row => <RiskBadge level={row.riskLevel} label={row.riskLabel} />, sortValue: row => riskRank(row.riskLevel) },
            { key: "confirmed", header: "Confirmation", render: row => row.frozen ? (
              <div className="table-main-cell"><span className="badge badge-gray">Gelé</span><span>{row.frozenBy?.fullName || row.frozenBy?.username || "-"} · {row.frozenAt ? displayDateTime(row.frozenAt) : "-"}</span></div>
            ) : row.confirmed ? (
              <div className="table-main-cell"><span className="badge badge-green">Confirmé</span><span>{row.confirmedBy?.fullName || row.confirmedBy?.username || "-"} · {row.confirmedAt ? displayDateTime(row.confirmedAt) : "-"}</span></div>
            ) : <span className="badge badge-gray">Non confirmé</span>, sortValue: row => row.frozen ? -1 : row.confirmed ? 1 : 0 },
            { key: "actions", header: "Actions", render: row => (
              <div className="row-actions">
                <Button variant="ghost" onClick={() => setCalendarEmployee({ id: row.employee.id, name: row.employee.fullName })}><CalendarDays size={15} /> Voir pointages</Button>
                {row.frozen ? (
                  <Button variant="secondary" onClick={() => unfreeze(row)} disabled={busyId === row.employee.id}><RefreshCw size={15} /> Restaurer</Button>
                ) : (
                  <>
                    {row.confirmed ? (
                      <Button variant="secondary" onClick={() => unconfirm(row)} disabled={busyId === row.employee.id}><X size={15} /> Retirer</Button>
                    ) : (
                      <Button variant="primary" onClick={() => confirm(row)} disabled={busyId === row.employee.id}><Check size={15} /> Confirmer</Button>
                    )}
                    <Button variant="secondary" onClick={() => freeze(row)} disabled={busyId === row.employee.id}><X size={15} /> Geler</Button>
                  </>
                )}
              </div>
            ) }
          ]}
        />
      </section>

      <AdvancedTreatmentPunchCalendar
        employee={calendarEmployee}
        from={filters.startDate}
        to={filters.endDate}
        onClose={() => setCalendarEmployee(null)}
      />
    </>
  );
}

function AdvancedTreatmentPunchCalendar({
  employee,
  from,
  to,
  onClose
}: {
  employee: { id: string; name: string } | null;
  from: string;
  to: string;
  onClose: () => void;
}) {
  const params = new URLSearchParams({
    startDate: from,
    endDate: to
  });
  const calendar = useApi<AdvancedTreatmentCalendar | null>(employee ? `/api/advanced-treatment/${employee.id}/calendar?${params.toString()}` : null, null);
  if (!employee) return null;

  const days = periodDays(from, to);
  const cells = buildPeriodCells(days);
  const byDate = new Map((calendar.data?.days || []).map(day => [day.date, day]));

  return (
    <div className="modal-backdrop">
      <div className="calendar-modal employee-calendar-print">
        <div className="modal-header">
          <div>
            <span>Calendrier des pointages réels</span>
            <strong>{employee.name}</strong>
            <small className="muted">{formatDate(from)} - {formatDate(to)}</small>
          </div>
          <div className="row-actions no-print">
            <Button variant="secondary" onClick={printEmployeeCalendar}><Printer size={16} /> Imprimer</Button>
            <button className="icon-button" onClick={onClose} title="Fermer"><X size={18} /></button>
          </div>
        </div>
        {calendar.loading && <LoadingState label="Chargement du calendrier..." />}
        {calendar.error && <div className="alert alert-error">Impossible de charger le calendrier: {calendar.error}</div>}
        {!calendar.loading && calendar.data && (
          <>
            <div className="attendance-summary-strip compact">
              <div><span>Jours avec pointage</span><strong>{calendar.data.stats.daysWithPunches}</strong></div>
              <div><span>Pointages réels</span><strong>{calendar.data.stats.punchCount}</strong></div>
              <div><span>Maladie</span><strong>{calendar.data.stats.sickDays}</strong></div>
              <div><span>Congé</span><strong>{calendar.data.stats.leaveDays}</strong></div>
              <div className={calendar.data.stats.warningDays > 0 ? "advanced-warning-stat" : ""}><span>À vérifier</span><strong>{calendar.data.stats.warningDays}</strong></div>
              <div><span>Période</span><strong>{calendar.data.stats.periodDays}</strong></div>
            </div>
            <div className="attendance-calendar">
              {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div className="calendar-head" key={day}>{day}</div>)}
              {cells.map(cell => {
                const day = cell.date ? byDate.get(cell.date) : null;
                const dayPunches = day?.punches || [];
                const hasPunches = dayPunches.length > 0;
                const classes = [
                  hasPunches ? "advanced-punch-day" : "",
                  day?.sick ? "advanced-sick-day" : "",
                  day?.leave ? "advanced-leave-day" : "",
                  day?.warning ? "advanced-warning-day" : ""
                ].filter(Boolean).join(" ");
                return (
                  <div key={cell.key} className={`calendar-day ${classes}`}>
                    {cell.date && <><strong>{cell.day}</strong><small>{cell.month}</small></>}
                    {day?.warning && <span className="badge badge-red">À vérifier</span>}
                    {hasPunches && (
                      <>
                        <span className="badge badge-green">Pointé</span>
                        <span>{dayPunches.length} pointage(s)</span>
                        {dayPunches.map(punch => (
                          <small key={punch.id}>{punch.punchHour} {punch.sourceDevice ? `· ${punch.sourceDevice}` : ""}</small>
                        ))}
                      </>
                    )}
                    {day?.sick && <span className="badge badge-pink">Maladie</span>}
                    {day?.leave && <span className="badge badge-blue">Congé</span>}
                    {day?.warning && <small className="advanced-warning-text">Pointage réel pendant maladie/congé.</small>}
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function buildParams(filters: Record<string, string>) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });
  return params;
}

function withCompany(params: URLSearchParams, company: string) {
  const next = new URLSearchParams(params);
  next.set("company", company);
  return next;
}

function RiskBadge({ level, label }: { level: AdvancedTreatmentRiskLevel; label: string }) {
  const className = level === "HIGH" ? "badge badge-red" : level === "MEDIUM" ? "badge badge-orange" : "badge badge-blue";
  return <span className={className}>{label}</span>;
}

function riskRank(level: AdvancedTreatmentRiskLevel) {
  if (level === "HIGH") return 3;
  if (level === "MEDIUM") return 2;
  return 1;
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
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function displayDateTime(value: string) {
  return new Date(value).toLocaleString("fr-FR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
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
