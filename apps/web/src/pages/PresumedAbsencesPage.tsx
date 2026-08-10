import { CalendarDays, Check, RefreshCw, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
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
  if (filters.date) params.set("date", filters.date);
  if (filters.search) params.set("search", filters.search);
  return `/api/attendance/presumed-absences?${params.toString()}`;
}

export function PresumedAbsencesPage() {
  const { filters, update, reset } = useSessionFilters("presumed.absences.filters", {
    status: "PENDING_REVIEW",
    date: todayKey(),
    search: ""
  });
  const rows = useApi<PresumedAbsence[]>(buildPath(filters), []);
  const [calendarEmployee, setCalendarEmployee] = useState<{ id: string; name: string } | null>(null);
  const [rejecting, setRejecting] = useState<PresumedAbsence | null>(null);
  const [rejectNote, setRejectNote] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const month = useMemo(() => (filters.date || todayKey()).slice(0, 7), [filters.date]);

  async function detect() {
    setDetecting(true);
    setMessage(null);
    setError(null);
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
      }>(`/api/attendance/presumed-absences/detect?date=${encodeURIComponent(filters.date || todayKey())}`, { method: "POST" });
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
          `${result.created} nouvelle(s) entrée(s): ${result.plannedCreated ?? 0} absence(s) planning, ${result.heuristicCreated ?? 0} absence(s) sans planning.${heuristicNote}`
        );
      }
      await rows.reload();
    } catch (detectError) {
      setError(readableError(detectError, "Vérification impossible."));
    } finally {
      setDetecting(false);
    }
  }

  async function confirm(row: PresumedAbsence) {
    setBusyId(row.id);
    setMessage(null);
    setError(null);
    try {
      await api(`/api/attendance/presumed-absences/${row.id}/confirm`, { method: "PATCH" });
      setMessage("Absence présumée confirmée.");
      await rows.reload();
    } catch (confirmError) {
      setError(readableError(confirmError, "Confirmation impossible."));
    } finally {
      setBusyId(null);
    }
  }

  async function reject() {
    if (!rejecting) return;
    setBusyId(rejecting.id);
    setMessage(null);
    setError(null);
    try {
      await api(`/api/attendance/presumed-absences/${rejecting.id}/reject`, {
        method: "PATCH",
        body: JSON.stringify({ reason: rejectNote.trim() || undefined })
      });
      setMessage("Absence présumée rejetée.");
      setRejecting(null);
      setRejectNote("");
      await rows.reload();
    } catch (rejectError) {
      setError(readableError(rejectError, "Rejet impossible."));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <>
      <PageHeader
        title="Absences non confirmées"
        actions={<Button variant="primary" onClick={detect} disabled={detecting}><RefreshCw size={15} /> {detecting ? "Vérification..." : "Vérifier les absences"}</Button>}
      />
      <section className="panel">
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
          <FilterField label="Date">
            <input type="date" value={filters.date} onChange={event => update({ date: event.target.value })} />
          </FilterField>
        </FiltersBar>

        <DataTable
          rows={rows.data}
          loading={rows.loading}
          loadingLabel="Chargement des absences non confirmées..."
          empty="Aucune absence présumée trouvée."
          pageSize={50}
          columns={[
            { key: "status", header: "Statut", render: row => <PresumedStatusBadge status={row.status} basis={row.basis} />, sortValue: row => `${row.status}${row.basis}` },
            { key: "employee", header: "Employé", render: row => (
              <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayMatricule(row)}</span></div>
            ), sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "date", header: "Jour", render: row => displayDate(row.date), sortValue: row => row.date },
            { key: "detected", header: "Détection", render: row => displayDateTime(row.detectedAt), sortValue: row => row.detectedAt },
            { key: "review", header: "Validation", render: row => row.reviewedBy ? (
              <div className="table-main-cell"><strong>{row.reviewedBy.fullName || row.reviewedBy.username}</strong><span>{row.reviewedAt ? displayDateTime(row.reviewedAt) : "-"}</span></div>
            ) : "-", sortValue: row => row.reviewedAt || "" },
            { key: "actions", header: "Actions", render: row => (
              <div className="row-actions">
                <Button variant="ghost" onClick={() => setCalendarEmployee({ id: row.employee.id, name: row.employee.fullName })}><CalendarDays size={15} /> Voir planning mensuel</Button>
                {row.status === "PENDING_REVIEW" && (
                  <>
                    <Button variant="secondary" onClick={() => confirm(row)} disabled={busyId === row.id}><Check size={15} /> Confirmer</Button>
                    <Button variant="secondary" onClick={() => { setRejecting(row); setRejectNote(""); }} disabled={busyId === row.id}><X size={15} /> Rejeter</Button>
                  </>
                )}
              </div>
            ) }
          ]}
        />
      </section>

      <EmployeeMonthlyCalendarModal employee={calendarEmployee} month={month} onClose={() => setCalendarEmployee(null)} />

      {rejecting && (
        <div className="modal-backdrop">
          <div className="app-modal">
            <div className="modal-header">
              <div>
                <span>Rejeter l'absence présumée</span>
                <strong>{rejecting.employee.fullName}</strong>
                <small className="muted">{displayDate(rejecting.date)}</small>
              </div>
              <button type="button" className="icon-button" onClick={() => setRejecting(null)} title="Fermer"><X size={18} /></button>
            </div>
            <div className="form-grid single">
              <label>
                Motif optionnel
                <textarea rows={4} value={rejectNote} onChange={event => setRejectNote(event.target.value)} placeholder="Ex: pointage arrivé tardivement, justification RH..." />
              </label>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setRejecting(null)} disabled={busyId === rejecting.id}>Annuler</Button>
              <Button variant="primary" onClick={reject} disabled={busyId === rejecting.id}>{busyId === rejecting.id ? "Rejet..." : "Rejeter"}</Button>
            </div>
          </div>
        </div>
      )}
    </>
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

function basisLabel(value: string) {
  if (value === "daily_absence_report") return "Depuis Absences / planning";
  if (value === "no_punch_heuristic") return "Sans planning · aucun pointage";
  return value || "-";
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
