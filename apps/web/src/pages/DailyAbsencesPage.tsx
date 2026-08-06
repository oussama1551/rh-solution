import { CalendarDays, Search, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { AbsenceTypeCode, DailyAbsenceReport, OrgUnit } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";
import { api } from "../lib/api";

function todayKey() {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function buildPath(filters: Record<string, string>) {
  const params = new URLSearchParams();
  params.set("date", filters.date || todayKey());
  if (filters.search) params.set("search", filters.search);
  if (filters.groupId) params.set("groupId", filters.groupId);
  else if (filters.subUnitId) params.set("subUnitId", filters.subUnitId);
  else if (filters.unitId) params.set("unitId", filters.unitId);
  return `/api/reports/daily-absences?${params.toString()}`;
}

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR");
}

function shiftWindow(row: DailyAbsenceReport["rows"][number]) {
  return `${row.shift.startTime || "--:--"} - ${row.shift.endTime || "--:--"}`;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  });
}

function readableApiError(message: string) {
  try {
    const parsed = JSON.parse(message) as { message?: string | string[] };
    if (Array.isArray(parsed.message)) return parsed.message.join(" ");
    if (parsed.message) return parsed.message;
  } catch {
    return message;
  }
  return message;
}

export function DailyAbsencesPage() {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [verificationRow, setVerificationRow] = useState<DailyAbsenceReport["rows"][number] | null>(null);
  const [reversalRow, setReversalRow] = useState<DailyAbsenceReport["rows"][number] | null>(null);
  const [reversalReason, setReversalReason] = useState("");
  const [reversalSaving, setReversalSaving] = useState(false);
  const [classificationRow, setClassificationRow] = useState<DailyAbsenceReport["rows"][number] | null>(null);
  const [classificationType, setClassificationType] = useState("");
  const [classificationNote, setClassificationNote] = useState("");
  const [classificationSaving, setClassificationSaving] = useState(false);
  const [classificationError, setClassificationError] = useState<string | null>(null);
  const { filters, update, reset } = useSessionFilters("daily.absences.filters", {
    date: todayKey(),
    search: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    status: ""
  });
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const absenceTypes = useApi<AbsenceTypeCode[]>("/api/attendance/absence-types?activeOnly=true", []);
  const report = useApi<DailyAbsenceReport>(buildPath(filters), {
    date: filters.date || todayKey(),
    generatedAt: new Date().toISOString(),
    totals: { planned: 0, absent: 0, notDue: 0 },
    byUnit: [],
    rows: []
  });
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;
  const visibleRows = report.data.rows.filter(row => !filters.status || row.status === filters.status);

  async function declareCompensation(row: DailyAbsenceReport["rows"][number]) {
    const compensationDate = window.prompt("Jour travaillé en compensation (YYYY-MM-DD)");
    if (!compensationDate) return;
    setMessage(null);
    setError(null);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/compensations", {
        method: "POST",
        body: JSON.stringify({
          employeeId: row.employee.id,
          absenceDate: row.date,
          compensationDate,
          note: `Compensation déclarée depuis absence du ${row.date}`
        })
      });
      setMessage(result.status === "PENDING_APPROVAL" ? "Compensation envoyée en validation." : "Compensation approuvée et enregistrée.");
    } catch (declareError) {
      setError(declareError instanceof Error ? declareError.message : "Déclaration impossible.");
    }
  }

  async function submitAbsenceReversal() {
    if (!reversalRow || !reversalReason.trim()) return;
    setMessage(null);
    setError(null);
    setReversalSaving(true);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/absence-reversals", {
        method: "POST",
        body: JSON.stringify({
          employeeId: reversalRow.employee.id,
          absenceDate: reversalRow.date,
          reason: reversalReason.trim()
        })
      });
      setMessage(result.status === "PENDING_APPROVAL"
        ? "Demande d'annulation envoyée en validation Admin/DRH."
        : "Absence annulée sans preuve de pointage. Elle restera visible pour audit après régénération de la synthèse.");
      setReversalRow(null);
      setVerificationRow(null);
      setReversalReason("");
      await report.reload();
    } catch (declareError) {
      setError(declareError instanceof Error ? declareError.message : "Demande impossible.");
    } finally {
      setReversalSaving(false);
    }
  }

  async function submitClassification() {
    if (!classificationRow || !classificationType) return;
    setMessage(null);
    setError(null);
    setClassificationError(null);
    setClassificationSaving(true);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/absence-types", {
        method: "POST",
        body: JSON.stringify({
          employeeId: classificationRow.employee.id,
          date: classificationRow.date,
          typeCode: classificationType,
          note: classificationNote.trim() || undefined
        })
      });
      setMessage(result.status === "PENDING_APPROVAL" ? "Classification envoyée en validation." : "Classification d'absence confirmée.");
      setClassificationRow(null);
      setClassificationType("");
      setClassificationNote("");
      await report.reload();
    } catch (declareError) {
      setClassificationError(declareError instanceof Error ? readableApiError(declareError.message) : "Classification impossible.");
    } finally {
      setClassificationSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Absences du jour" />
      <section className="panel">
        <FiltersBar onReset={reset}>
          <FilterField label="Jour">
            <input type="date" value={filters.date} onChange={event => update({ date: event.target.value })} />
          </FilterField>
          <FilterField label="Recherche">
            <div className="input-icon">
              <Search size={15} />
              <input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule..." />
            </div>
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
          <FilterField label="Statut">
            <select value={filters.status} onChange={event => update({ status: event.target.value })}>
              <option value="">Tous</option>
              <option value="ABSENT">Absents</option>
              <option value="NOT_DUE">À venir</option>
            </select>
          </FilterField>
        </FiltersBar>

        {report.error && <div className="alert alert-error">Impossible de charger les absences.</div>}
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="attendance-summary-strip">
          <div><span>Jour</span><strong>{formatDate(report.data.date)}</strong></div>
          <div><span>Planifiés</span><strong>{report.data.totals.planned}</strong></div>
          <div><span>Absents</span><strong>{report.data.totals.absent}</strong></div>
          <div><span>Pas encore dû</span><strong>{report.data.totals.notDue}</strong></div>
        </div>

        <div className="unit-stat-grid">
          {report.data.byUnit.map(unit => (
            <div key={unit.unitName}>
              <strong>{unit.unitName}</strong>
              <span>Planifiés: {unit.planned}</span>
              <span>Absents: {unit.absent}</span>
              <span>À venir: {unit.notDue}</span>
            </div>
          ))}
        </div>

        <DataTable
          rows={visibleRows}
          loading={report.loading || orgTree.loading}
          loadingLabel="Chargement des absences..."
          empty="Aucune absence selon le planning sélectionné."
          pageSize={50}
          columns={[
            { key: "status", header: "Statut", render: row => row.status === "ABSENT" ? <StatusBadge value="REJECTED" label="Absent" /> : <StatusBadge value="PENDING" label="À venir" />, sortValue: row => row.status },
            { key: "employee", header: "Employé", render: row => (
              <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>
            ), sortValue: row => row.employee.fullName },
            { key: "org", header: "Organigramme", render: row => [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-", sortValue: row => `${row.employee.unitName || ""}${row.employee.subUnitName || ""}${row.employee.groupName || ""}` },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "shift", header: "Planning", render: row => (
              <div className="table-main-cell">
                <strong>{row.shift.label}</strong>
                <span>{shiftWindow(row)} · {planningSourceLabel(row)}</span>
              </div>
            ), sortValue: row => row.shift.startTime || "" },
            { key: "punches", header: "Pointages", render: row => (
              <div className="table-main-cell">
                <strong>{row.punches.length}</strong>
                <span>{row.punches.length ? row.punches.map(punch => new Date(punch.punchTime).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", hour12: false })).join(" · ") : "Aucun pointage"}</span>
              </div>
            ), sortValue: row => row.punches.length },
            { key: "actions", header: "Actions", render: row => (
              <div className="row-actions">
                <Button variant="ghost" onClick={() => setVerificationRow(row)}><CalendarDays size={15} /> Vérifier</Button>
                {row.status === "ABSENT" ? <Button variant="secondary" onClick={() => declareCompensation(row)}>Déclarer compensation</Button> : null}
                {row.status === "ABSENT" ? <Button variant="secondary" onClick={() => { setReversalRow(row); setReversalReason(""); }}>Demander annulation</Button> : null}
                {row.status === "ABSENT" ? <Button variant="primary" onClick={() => { setClassificationRow(row); setClassificationType(absenceTypes.data[0]?.code || ""); setClassificationNote(""); setClassificationError(null); }}>Classifier</Button> : null}
              </div>
            ) }
          ]}
        />
      </section>
      {verificationRow && (
        <AbsenceVerificationModal
          row={verificationRow}
          onClose={() => setVerificationRow(null)}
          onRequestReversal={() => { setReversalRow(verificationRow); setReversalReason(""); }}
        />
      )}
      {reversalRow && (
        <div className="modal-backdrop">
          <div className="app-modal">
            <div className="modal-header">
              <div>
                <span>Annulation d'absence</span>
                <strong>{reversalRow.employee.fullName}</strong>
                <small className="muted">{formatDate(reversalRow.date)} - sans preuve de pointage</small>
              </div>
              <button type="button" className="icon-button" onClick={() => setReversalRow(null)} title="Fermer" disabled={reversalSaving}><X size={18} /></button>
            </div>
            <div className="alert alert-warning">Cette demande annule un statut Absent sans pointage BioTime. Le motif est obligatoire et restera visible pour audit.</div>
            <div className="form-grid single">
              <label>
                Motif obligatoire
                <textarea
                  autoFocus
                  rows={4}
                  value={reversalReason}
                  onChange={event => setReversalReason(event.target.value)}
                  placeholder="Expliquez pourquoi cette absence doit être annulée..."
                />
              </label>
            </div>
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setReversalRow(null)} disabled={reversalSaving}>Annuler</Button>
              <Button variant="primary" onClick={submitAbsenceReversal} disabled={reversalSaving || !reversalReason.trim()}>
                {reversalSaving ? "Envoi..." : "Envoyer la demande"}
              </Button>
            </div>
          </div>
        </div>
      )}
      {classificationRow && (
        <div className="modal-backdrop">
          <div className="app-modal">
            <div className="modal-header">
              <div>
                <span>Classifier l'absence</span>
                <strong>{classificationRow.employee.fullName}</strong>
                <small className="muted">{formatDate(classificationRow.date)}</small>
              </div>
              <button type="button" className="icon-button" onClick={() => setClassificationRow(null)} title="Fermer" disabled={classificationSaving}><X size={18} /></button>
            </div>
            <div className="form-grid single">
              <label>
                Type d'absence
                <select value={classificationType} onChange={event => setClassificationType(event.target.value)}>
                  {absenceTypes.data.map(type => <option key={type.code} value={type.code}>{type.code} - {type.label}</option>)}
                </select>
              </label>
              <label>
                Motif / note
                <textarea rows={3} value={classificationNote} onChange={event => setClassificationNote(event.target.value)} placeholder="Note optionnelle..." />
              </label>
            </div>
            {absenceTypes.error && <div className="alert alert-error">Impossible de charger les types d'absence.</div>}
            {classificationError && <div className="alert alert-error">{classificationError}</div>}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setClassificationRow(null)} disabled={classificationSaving}>Annuler</Button>
              <Button variant="primary" onClick={submitClassification} disabled={classificationSaving || !classificationType}>
                {classificationSaving ? "Enregistrement..." : "Enregistrer"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function AbsenceVerificationModal({ row, onClose, onRequestReversal }: { row: DailyAbsenceReport["rows"][number]; onClose: () => void; onRequestReversal: () => void }) {
  return (
    <div className="modal-backdrop">
      <div className="app-modal absence-check-modal">
        <div className="modal-header">
          <div>
            <span>Contrôle absence</span>
            <strong>{row.employee.fullName}</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fermer"><X size={18} /></button>
        </div>
        <div className="attendance-summary-strip compact absence-check-summary">
          <div><span>Jour</span><strong>{formatDate(row.date)}</strong></div>
          <div><span>Statut</span><strong>{row.status === "ABSENT" ? "Absent" : "À venir"}</strong></div>
          <div><span>Pointages</span><strong>{row.punches.length}</strong></div>
        </div>
        <div className="detail-grid compact absence-check-grid">
          <div><span>Matricule</span><strong>{row.employee.code}</strong></div>
          <div><span>Organigramme</span><strong>{[row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-"}</strong></div>
          <div><span>Planning appliqué</span><strong>{row.shift.label} · {shiftWindow(row)}</strong></div>
          <div><span>Source planning</span><strong>{planningSourceLabel(row)}</strong></div>
          <div><span>Groupe planning</span><strong>{row.planning.sourceGroupName || row.planning.employeeGroupName || "-"}</strong></div>
          <div><span>Département</span><strong>{row.employee.department || "-"}</strong></div>
        </div>
        <div className="panel-header">
          <h2>Pointages du jour</h2>
          <span className="muted">{row.punches.length} punch(es)</span>
        </div>
        {row.punches.length ? (
          <div className="assignment-history">
            {row.punches.map(punch => (
              <div key={punch.id}>
                <strong>{formatDateTime(punch.punchTime)}</strong>
                <span>{punch.direction} · {punch.sourceId || punch.id}</span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">Aucun pointage réel trouvé pour ce jour.</div>
        )}
        {row.status === "ABSENT" && (
          <div className="modal-actions">
            <Button variant="secondary" onClick={onRequestReversal}>Demander l'annulation de l'absence</Button>
          </div>
        )}
      </div>
    </div>
  );
}

function planningSourceLabel(row: DailyAbsenceReport["rows"][number]) {
  if (row.planning.assignedVia === "group") return `Groupe${row.planning.sourceGroupName ? `: ${row.planning.sourceGroupName}` : ""}`;
  if (row.planning.assignedVia === "individual") return "Individuel";
  return "Planning";
}
