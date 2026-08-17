import { CalendarDays, Check, Printer, RefreshCw, Search, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { EmployeeMonthlyCalendarModal } from "../components/EmployeeMonthlyCalendarModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { PresumedAbsence, PresumedAbsenceStatus } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function buildPath(filters: Record<string, string>) {
  const params = new URLSearchParams();
  if (filters.status) params.set("status", filters.status);
  if (filters.caseType) params.set("caseType", filters.caseType);
  if (filters.dateMode === "range") {
    if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
    if (filters.dateTo) params.set("dateTo", filters.dateTo);
  } else if (filters.date) {
    params.set("date", filters.date);
  }
  if (filters.search) params.set("search", filters.search);
  return `/api/attendance/presumed-absences?${params.toString()}`;
}

export function PresumedAbsencesPage() {
  const { filters, update, reset } = useSessionFilters("presumed.absences.filters", {
    status: "PENDING_REVIEW",
    caseType: "",
    dateMode: "day",
    date: todayKey(),
    dateFrom: todayKey(),
    dateTo: todayKey(),
    search: ""
  });
  const rows = useApi<PresumedAbsence[]>(buildPath(filters), []);
  const [calendarEmployee, setCalendarEmployee] = useState<{ id: string; name: string } | null>(null);
  const [rejecting, setRejecting] = useState<PresumedAbsence | null>(null);
  const [bulkRejecting, setBulkRejecting] = useState(false);
  const [rejectNote, setRejectNote] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const autoDetectingRef = useRef(false);
  const lastAutoDetectDateRef = useRef<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = useMemo(() => (activeCalendarDate(filters) || todayKey()).slice(0, 7), [filters]);
  const selectedRows = useMemo(() => rows.data.filter(row => selectedIds.has(row.id)), [rows.data, selectedIds]);
  const selectedPendingRows = useMemo(() => selectedRows.filter(row => row.status === "PENDING_REVIEW"), [selectedRows]);
  const printRows = selectedRows.length > 0 ? selectedRows : rows.data;

  useEffect(() => {
    setSelectedIds(current => new Set([...current].filter(id => rows.data.some(row => row.id === id))));
  }, [rows.data]);

  useEffect(() => {
    const date = activeCalendarDate(filters) || todayKey();
    if (lastAutoDetectDateRef.current === date || autoDetectingRef.current) return;
    lastAutoDetectDateRef.current = date;
    autoDetectingRef.current = true;
    detect(true).finally(() => {
      autoDetectingRef.current = false;
    });
  }, [filters.date, filters.dateFrom, filters.dateTo, filters.dateMode]);

  async function detect(silent = false) {
    if (!silent) {
      setDetecting(true);
      setMessage(null);
      setError(null);
    }
    try {
      const result = await api<{
        skipped: boolean;
        reason?: string;
        heuristicSkippedReason?: string;
        checked: number;
        created: number;
        plannedChecked?: number;
        plannedCreated?: number;
        heuristicChecked?: number;
        heuristicCreated?: number;
        unexpectedPresenceChecked?: number;
        unexpectedPresenceCreated?: number;
      }>(`/api/attendance/presumed-absences/detect?date=${encodeURIComponent(activeCalendarDate(filters) || todayKey())}`, { method: "POST" });
      if (silent) {
        await rows.reload();
        return;
      }
      if (result.skipped) {
        setMessage(result.reason === "friday" ? "Détection ignorée: vendredi exclu." : "Détection ignorée: seuil 08:30 non atteint.");
      } else {
        const heuristicNote = result.heuristicSkippedReason === "friday"
          ? " Heuristique sans planning ignorée: vendredi."
          : result.heuristicSkippedReason === "before_threshold"
            ? " Heuristique sans planning ignorée: seuil 08:30 non atteint."
            : result.heuristicSkippedReason === "not_today"
              ? " Heuristique sans planning ignorée: date différente d'aujourd'hui."
            : "";
        setMessage(
          `${result.created} nouvelle(s) entrée(s): ${result.plannedCreated ?? 0} absence(s) planning, ${result.heuristicCreated ?? 0} absence(s) sans planning, ${result.unexpectedPresenceCreated ?? 0} présence(s) sur repos.${heuristicNote}`
        );
      }
      await rows.reload();
    } catch (detectError) {
      if (!silent) setError(readableError(detectError, "Vérification impossible."));
    } finally {
      if (!silent) setDetecting(false);
    }
  }

  async function confirm(row: PresumedAbsence) {
    setBusyId(row.id);
    setMessage(null);
    setError(null);
    try {
      await api(`/api/attendance/presumed-absences/${row.id}/confirm`, { method: "PATCH" });
      setMessage(row.caseType === "UNEXPECTED_PRESENCE_ON_REST" ? "Présence inattendue confirmée." : "Absence présumée confirmée.");
      await rows.reload();
    } catch (confirmError) {
      setError(readableError(confirmError, "Confirmation impossible."));
    } finally {
      setBusyId(null);
    }
  }

  async function confirmSelected() {
    if (selectedPendingRows.length === 0) return;
    setBusyId("bulk");
    setMessage(null);
    setError(null);
    try {
      await Promise.all(selectedPendingRows.map(row => api(`/api/attendance/presumed-absences/${row.id}/confirm`, { method: "PATCH" })));
      setMessage(`${selectedPendingRows.length} cas confirmé(s).`);
      setSelectedIds(new Set());
      await rows.reload();
    } catch (confirmError) {
      setError(readableError(confirmError, "Confirmation groupée impossible."));
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    const targets = bulkRejecting ? selectedPendingRows : rejecting ? [rejecting] : [];
    if (targets.length === 0) return;
    setBusyId(bulkRejecting ? "bulk" : targets[0].id);
    setMessage(null);
    setError(null);
    try {
      await Promise.all(targets.map(row => api(`/api/attendance/presumed-absences/${row.id}/reject`, {
        method: "PATCH", body: JSON.stringify({ reason: rejectNote.trim() || undefined })
      })));
      setMessage(targets.length > 1 ? `${targets.length} cas rejeté(s).` : targets[0].caseType === "UNEXPECTED_PRESENCE_ON_REST" ? "Signalement de présence rejeté." : "Absence présumée rejetée.");
      setRejecting(null);
      setBulkRejecting(false);
      setSelectedIds(new Set());
      setRejectNote("");
      await rows.reload();
    } catch (rejectError) {
      setError(readableError(rejectError, "Rejet impossible."));
    } finally {
      setBusyId(null);
    }
  }

  function toggleSelection(id: string) {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  return (
    <>
      <PageHeader
        title="Absences non confirmées"
        actions={(
          <div className="row-actions">
            <Button variant="secondary" onClick={printPresumedAbsences} disabled={rows.loading || printRows.length === 0}><Printer size={15} /> {selectedRows.length ? `Imprimer sélection (${selectedRows.length})` : `Imprimer liste filtrée (${rows.data.length})`}</Button>
            <Button variant="primary" onClick={() => detect()} disabled={detecting}><RefreshCw size={15} /> {detecting ? "Vérification..." : "Vérifier"}</Button>
          </div>
        )}
      />
      <section className="panel">
        <p className="muted">Vérifications de présence : absences présumées et présences inattendues sur jour de repos.</p>
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom ou matricule..." /></div>
          </FilterField>
          <FilterField label="Statut">
            <select value={filters.status} onChange={event => update({ status: event.target.value })}>
              <option value="">Tous</option>
              <option value="PENDING_REVIEW">En attente</option>
              <option value="CONFIRMED">Confirmé</option>
              <option value="REJECTED">Rejeté</option>
            </select>
          </FilterField>
          <FilterField label="Type de cas">
            <select value={filters.caseType} onChange={event => update({ caseType: event.target.value })}>
              <option value="">Tous</option>
              <option value="PRESUMED_ABSENCE">Absence présumée</option>
              <option value="UNEXPECTED_PRESENCE_ON_REST">Présence inattendue sur repos</option>
            </select>
          </FilterField>
          <FilterField label="Mode date">
            <select value={filters.dateMode} onChange={event => update({ dateMode: event.target.value })}>
              <option value="day">Jour seul</option>
              <option value="range">Période</option>
            </select>
          </FilterField>
          {filters.dateMode === "range" ? (
            <>
              <FilterField label="Du">
                <input type="date" value={filters.dateFrom} onChange={event => update({ dateFrom: event.target.value })} />
              </FilterField>
              <FilterField label="Au">
                <input type="date" value={filters.dateTo} onChange={event => update({ dateTo: event.target.value })} />
              </FilterField>
            </>
          ) : (
            <FilterField label="Date">
              <input type="date" value={filters.date} onChange={event => update({ date: event.target.value })} />
            </FilterField>
          )}
        </FiltersBar>

        <div className="row-actions selection-toolbar">
          <Button variant="secondary" onClick={() => setSelectedIds(new Set(rows.data.map(row => row.id)))} disabled={rows.data.length === 0}>Tout sélectionner ({rows.data.length})</Button>
          <Button variant="ghost" onClick={() => setSelectedIds(new Set())} disabled={selectedRows.length === 0}>Effacer la sélection</Button>
          <span className="muted">{selectedRows.length} sélectionné(s), dont {selectedPendingRows.length} en attente</span>
          <Button variant="primary" onClick={confirmSelected} disabled={selectedPendingRows.length === 0 || busyId === "bulk"}><Check size={15} /> Confirmer la sélection</Button>
          <Button variant="secondary" onClick={() => { setBulkRejecting(true); setRejectNote(""); }} disabled={selectedPendingRows.length === 0 || busyId === "bulk"}><X size={15} /> Rejeter la sélection</Button>
        </div>

        <DataTable
          rows={rows.data}
          loading={rows.loading}
          loadingLabel="Chargement des vérifications de présence..."
          empty="Aucun cas de présence trouvé."
          pageSize={50}
          columns={[
            { key: "select", header: "Sélection", render: row => <input type="checkbox" checked={selectedIds.has(row.id)} onChange={() => toggleSelection(row.id)} aria-label={`Sélectionner ${row.employee.fullName}`} /> },
            { key: "status", header: "Statut", render: row => <PresumedStatusBadge status={row.status} basis={row.basis} />, sortValue: row => `${row.status}${row.basis}` },
            { key: "caseType", header: "Type de cas", render: row => <CaseTypeBadge value={row.caseType} />, sortValue: row => row.caseType },
            { key: "employee", header: "Employé", render: row => (
              <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayMatricule(row)}</span></div>
            ), sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "date", header: "Jour", render: row => displayDate(row.date), sortValue: row => row.date },
            { key: "detected", header: "Détection", render: row => displayDateTime(row.detectedAt), sortValue: row => row.detectedAt },
            { key: "message", header: "Détail", render: row => row.message || basisLabel(row.basis), sortValue: row => row.message || "" },
            { key: "review", header: "Validation", render: row => row.reviewedBy ? (
              <div className="table-main-cell"><strong>{row.reviewedBy.fullName || row.reviewedBy.username}</strong><span>{row.reviewedAt ? displayDateTime(row.reviewedAt) : "-"}</span></div>
            ) : "-", sortValue: row => row.reviewedAt || "" },
            { key: "actions", header: "Actions", render: row => (
              <div className="row-actions">
                <Button variant="ghost" onClick={() => setCalendarEmployee({ id: row.employee.id, name: row.employee.fullName })}><CalendarDays size={15} /> Voir planning mensuel</Button>
                {row.status === "PENDING_REVIEW" && (
                  <>
                    <Button variant="secondary" onClick={() => confirm(row)} disabled={busyId === row.id}><Check size={15} /> {row.caseType === "UNEXPECTED_PRESENCE_ON_REST" ? "Confirmer la présence" : "Confirmer l'absence"}</Button>
                    <Button variant="secondary" onClick={() => { setRejecting(row); setRejectNote(""); }} disabled={busyId === row.id}><X size={15} /> Rejeter</Button>
                  </>
                )}
              </div>
            ) }
          ]}
        />
        <PresumedAbsencesPrint rows={printRows} filters={filters} selectedOnly={selectedRows.length > 0} />
      </section>

      <EmployeeMonthlyCalendarModal employee={calendarEmployee} month={month} onClose={() => setCalendarEmployee(null)} />

      {(rejecting || bulkRejecting) && (
        <div className="modal-backdrop">
          <div className="app-modal">
            <div className="modal-header">
              <div>
                <span>{bulkRejecting ? "Rejeter les cas sélectionnés" : rejecting?.caseType === "UNEXPECTED_PRESENCE_ON_REST" ? "Rejeter le signalement de présence" : "Rejeter l'absence présumée"}</span>
                <strong>{bulkRejecting ? `${selectedPendingRows.length} cas en attente` : rejecting?.employee.fullName}</strong>
                {!bulkRejecting && rejecting && <small className="muted">{displayDate(rejecting.date)}</small>}
              </div>
              <button type="button" className="icon-button" onClick={() => { setRejecting(null); setBulkRejecting(false); }} title="Fermer"><X size={18} /></button>
            </div>
            <div className="form-grid single">
              <label>
                Motif optionnel
                <textarea rows={4} value={rejectNote} onChange={event => setRejectNote(event.target.value)} placeholder="Ex: pointage arrivé tardivement, justification RH..." />
              </label>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => { setRejecting(null); setBulkRejecting(false); }} disabled={busyId === "bulk" || busyId === rejecting?.id}>Annuler</Button>
              <Button variant="primary" onClick={reject} disabled={busyId === "bulk" || busyId === rejecting?.id}>{busyId === "bulk" || busyId === rejecting?.id ? "Rejet..." : bulkRejecting ? `Rejeter ${selectedPendingRows.length} cas` : "Rejeter"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function PresumedAbsencesPrint({ rows, filters, selectedOnly }: { rows: PresumedAbsence[]; filters: Record<string, string>; selectedOnly: boolean }) {
  return (
    <div className="presumed-absences-print print-root">
      <div className="print-header">
        <div>
          <span>RH Solution</span>
          <h1>Absences non confirmées</h1>
          <p>{printPeriodLabel(filters)} · Statut: {statusLabel(filters.status)} · Type: {caseTypeLabel(filters.caseType)} · {selectedOnly ? "Sélection manuelle" : "Liste filtrée"}</p>
        </div>
        <strong>{rows.length} résultat(s)</strong>
      </div>
      <table className="print-table">
        <thead>
          <tr>
            <th>N°</th>
            <th>Statut</th>
            <th>Employé</th>
            <th>Matricule</th>
            <th>Département</th>
            <th>Jour</th>
            <th>Détection</th>
            <th>Validation</th>
            <th>Source</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={row.id}>
              <td>{index + 1}</td>
              <td>{statusLabel(row.status)}</td>
              <td>{row.employee.fullName}</td>
              <td>{displayMatricule(row)}</td>
              <td>{row.employee.department || "-"}</td>
              <td>{displayDate(row.date)}</td>
              <td>{displayDateTime(row.detectedAt)}</td>
              <td>{row.reviewedBy ? `${row.reviewedBy.fullName || row.reviewedBy.username} · ${row.reviewedAt ? displayDateTime(row.reviewedAt) : "-"}` : "-"}</td>
              <td>{basisLabel(row.basis)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function PresumedStatusBadge({ status, basis }: { status: PresumedAbsenceStatus; basis: string }) {
  const labels: Record<PresumedAbsenceStatus, string> = {
    PENDING_REVIEW: "En attente",
    CONFIRMED: "Confirmé",
    REJECTED: "Rejeté"
  };
  const className = status === "CONFIRMED" ? "badge badge-green" : status === "REJECTED" ? "badge badge-red" : "badge badge-orange";
  return (
    <div className="table-main-cell">
      <span className={className}>{labels[status]}</span>
      <span>{basisLabel(basis)}</span>
    </div>
  );
}

function CaseTypeBadge({ value }: { value: PresumedAbsence["caseType"] }) {
  return value === "UNEXPECTED_PRESENCE_ON_REST"
    ? <span className="badge badge-blue">Présence inattendue sur repos</span>
    : <span className="badge badge-red">Absence présumée</span>;
}

function basisLabel(value: string) {
  if (value === "daily_absence_report") return "Depuis Absences / planning";
  if (value === "no_punch_heuristic") return "Sans planning · aucun pointage";
  if (value === "rest_schedule_with_punch") return "Planning REPOS · pointage réel";
  return value || "-";
}

function activeCalendarDate(filters: Record<string, string>) {
  return filters.dateMode === "range" ? filters.dateFrom || filters.dateTo : filters.date;
}

function printPeriodLabel(filters: Record<string, string>) {
  if (filters.dateMode === "range") {
    const from = filters.dateFrom ? displayDate(filters.dateFrom) : "...";
    const to = filters.dateTo ? displayDate(filters.dateTo) : "...";
    return `Période: ${from} - ${to}`;
  }
  return `Jour: ${displayDate(filters.date || todayKey())}`;
}

function statusLabel(status?: string) {
  if (status === "PENDING_REVIEW") return "En attente";
  if (status === "CONFIRMED") return "Confirmé";
  if (status === "REJECTED") return "Rejeté";
  return "Tous";
}

function caseTypeLabel(caseType?: string) {
  if (caseType === "PRESUMED_ABSENCE") return "Absence présumée";
  if (caseType === "UNEXPECTED_PRESENCE_ON_REST") return "Présence inattendue sur repos";
  return "Tous";
}

function printPresumedAbsences() {
  document.body.dataset.printMode = "presumed-absences";
  const cleanup = () => {
    delete document.body.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => window.print(), 50);
}

function displayMatricule(row: PresumedAbsence) {
  return row.employee.localMatricule || row.employee.biotimeCode || row.employee.employeeCode || row.employee.zktecoId;
}

function displayDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  return `${match[3]}/${match[2]}/${match[1]}`;
}

function displayDateTime(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  });
}

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || JSON.stringify(parsed);
  } catch {
    return error.message || fallback;
  }
}
