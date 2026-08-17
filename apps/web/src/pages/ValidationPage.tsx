import { CalendarDays, Check, X } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { AttendanceStatusBadge } from "../components/AttendanceStatusBadge";
import { api } from "../lib/api";
import { shiftLabel } from "../lib/shiftLabels";
import { AttendanceDailyRow, AttendanceFlag, ManualDeclarationApprovals, PlanningApprovals } from "../lib/types";
import { useApi } from "../lib/useApi";

export function ValidationPage() {
  const flags = useApi<AttendanceFlag[]>("/api/attendance/flags/pending", []);
  const approvals = useApi<PlanningApprovals>("/api/attendance/planning-approvals", { groups: [], plannings: [], memberships: [] });
  const declarations = useApi<ManualDeclarationApprovals>("/api/attendance/declarations/pending", { overtime: [], compensations: [], sickLeaves: [], leaves: [], absenceReversals: [] });
  const [message, setMessage] = useState<string | null>(null);
  const [tab, setTab] = useState<"planning" | "declarations" | "attendance">("planning");
  const [dayPreview, setDayPreview] = useState<{ employeeId: string; employeeName: string; date: string } | null>(null);
  const [rejectModal, setRejectModal] = useState<RejectModalState | null>(null);
  const previewPath = dayPreview
    ? `/api/attendance/daily?employeeId=${encodeURIComponent(dayPreview.employeeId)}&from=${dayPreview.date}T00:00:00&to=${dayPreview.date}T23:59:59`
    : null;
  const previewRows = useApi<AttendanceDailyRow[]>(previewPath, []);

  async function validate(id: string) {
    await api(`/api/attendance/flags/${id}/validate`, { method: "PATCH" });
    setMessage("Pointage validé et compté comme présence.");
    flags.reload();
  }

  async function reject(id: string, reason: string) {
    await api(`/api/attendance/flags/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
    setMessage("Pointage rejeté.");
    flags.reload();
  }

  async function approvePlanning(id: string) {
    await api(`/api/attendance/planning-approvals/${id}/approve`, { method: "PATCH" });
    setMessage("Planning approuvé.");
    approvals.reload();
  }

  async function rejectPlanning(id: string, reason: string) {
    await api(`/api/attendance/planning-approvals/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
    setMessage("Planning rejeté.");
    approvals.reload();
  }

  async function approveGroup(id: string) {
    await api(`/api/org/groups/${id}/approve`, { method: "PATCH" });
    setMessage("Groupe approuvé.");
    approvals.reload();
  }

  async function rejectGroup(id: string, reason: string) {
    await api(`/api/org/groups/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
    setMessage("Groupe rejeté.");
    approvals.reload();
  }

  async function approveMembership(id: string) {
    await api(`/api/org/membership-changes/${id}/approve`, { method: "PATCH" });
    setMessage("Mouvement d'employé approuvé.");
    approvals.reload();
  }

  async function rejectMembership(id: string, reason: string) {
    await api(`/api/org/membership-changes/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
    setMessage("Mouvement d'employé rejeté.");
    approvals.reload();
  }

  async function approveDeclaration(type: "overtime" | "compensations" | "sick-leaves" | "leaves" | "absence-reversals", id: string) {
    await api(`/api/attendance/declarations/${type}/${id}/approve`, { method: "PATCH" });
    setMessage("Déclaration approuvée.");
    declarations.reload();
  }

  async function rejectDeclaration(type: "overtime" | "compensations" | "sick-leaves" | "leaves" | "absence-reversals", id: string, reason: string) {
    await api(`/api/attendance/declarations/${type}/${id}/reject`, { method: "PATCH", body: JSON.stringify({ reason }) });
    setMessage("Déclaration rejetée.");
    declarations.reload();
  }

  function openRejectModal(title: string, description: string, onConfirm: (reason: string) => Promise<void>) {
    setRejectModal({ title, description, reason: "", saving: false, onConfirm });
  }

  async function confirmReject() {
    if (!rejectModal || !rejectModal.reason.trim()) return;
    const modal = rejectModal;
    setRejectModal({ ...modal, saving: true });
    try {
      await modal.onConfirm(modal.reason.trim());
      setRejectModal(null);
    } catch (error) {
      setRejectModal({ ...modal, saving: false, error: error instanceof Error ? error.message : "Erreur pendant le rejet." });
    }
  }

  return (
    <>
      <PageHeader title="Validations RH" />
      <section className="panel">
        {message && <div className="alert alert-success">{message}</div>}
        <div className="tabs">
          <button className={tab === "planning" ? "active" : ""} onClick={() => setTab("planning")}>Groupes & plannings</button>
          <button className={tab === "declarations" ? "active" : ""} onClick={() => setTab("declarations")}>Déclarations</button>
          <button className={tab === "attendance" ? "active" : ""} onClick={() => setTab("attendance")}>Pointages hors-créneau</button>
        </div>

        {tab === "planning" ? (
          <div className="stack">
            {approvals.error && <div className="alert alert-error">Impossible de charger les soumissions.</div>}
            <div className="panel-header">
              <h2>Groupes en attente</h2>
              <span className="muted">{approvals.data.groups.length} groupe(s)</span>
            </div>
            <DataTable
              rows={approvals.data.groups}
              empty="Aucun groupe en attente."
              columns={[
                { key: "name", header: "Groupe", render: row => <strong>{row.name}</strong>, sortValue: row => row.name },
                { key: "request", header: "Demande", render: row => groupRequestLabel(row) },
                { key: "org", header: "Organigramme", render: row => `${row.unitName} > ${row.subUnitName}` },
                { key: "submitted", header: "Soumis par", render: row => row.submittedBy?.fullName || row.submittedBy?.username || "-" },
                { key: "date", header: "Date", render: row => row.submittedAt ? new Date(row.submittedAt).toLocaleString("fr-FR") : "-" },
                { key: "count", header: "Effectif", render: row => row.employeeCount },
                { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <Button variant="primary" onClick={() => approveGroup(row.id)}><Check size={15} /> Approuver</Button>
                    <Button variant="danger" onClick={() => openRejectModal("Rejeter le groupe", `${row.name} - ${row.unitName} > ${row.subUnitName}`, reason => rejectGroup(row.id, reason))}><X size={15} /> Rejeter</Button>
                  </div>
                )}
              ]}
            />

            <div className="panel-header">
              <h2>Plannings en attente</h2>
              <span className="muted">{approvals.data.plannings.length} soumission(s)</span>
            </div>
            <DataTable
              rows={approvals.data.plannings}
              empty="Aucun planning en attente."
              columns={[
                { key: "scope", header: "Périmètre", render: row => row.group ? `${row.group.unitName} > ${row.group.subUnitName} > ${row.group.name}` : "Individuel" },
                { key: "submitted", header: "Soumis par", render: row => row.submittedBy?.fullName || row.submittedBy?.username || "-" },
                { key: "date", header: "Date", render: row => row.submittedAt ? new Date(row.submittedAt).toLocaleString("fr-FR") : "-" },
                { key: "size", header: "Volume", render: row => `${row.employeeCount} employé(s), ${row.dayCount} jour(s)` },
                { key: "preview", header: "Aperçu", render: row => (
                  <div className="approval-preview">
                    {row.preview.slice(0, 6).map(item => (
                      <span key={`${item.employeeName}-${item.date}`} className={`shift-badge shift-badge-${item.shiftType.toLowerCase()}`}>
                        {new Date(`${item.date}T00:00:00`).toLocaleDateString("fr-FR")} - {item.employeeName} - {shiftLabel(item.shiftType, item.shiftLabel)}
                      </span>
                    ))}
                  </div>
                ) },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <Button variant="primary" onClick={() => approvePlanning(row.id)}><Check size={15} /> Approuver</Button>
                    <Button variant="danger" onClick={() => openRejectModal("Rejeter le planning", row.group ? `${row.group.unitName} > ${row.group.subUnitName} > ${row.group.name}` : "Planning individuel", reason => rejectPlanning(row.id, reason))}><X size={15} /> Rejeter</Button>
                  </div>
                )}
              ]}
            />

            <div className="panel-header">
              <h2>Rattachements employés en attente</h2>
              <span className="muted">{approvals.data.memberships.length} demande(s)</span>
            </div>
            <DataTable
              rows={approvals.data.memberships}
              empty="Aucun rattachement employé en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => <strong>{row.employee.fullName}</strong>, sortValue: row => row.employee.fullName },
                { key: "code", header: "Matricule", render: row => row.employee.code },
                { key: "action", header: "Action", render: row => membershipActionLabel(row) },
                { key: "from", header: "De", render: row => row.fromGroup ? `${row.fromGroup.unitName} > ${row.fromGroup.subUnitName} > ${row.fromGroup.name}` : "-" },
                { key: "to", header: "Vers", render: row => row.toGroup ? `${row.toGroup.unitName} > ${row.toGroup.subUnitName} > ${row.toGroup.name}` : "-" },
                { key: "submitted", header: "Soumis par", render: row => row.submittedBy?.fullName || row.submittedBy?.username || "-" },
                { key: "date", header: "Date", render: row => row.submittedAt ? new Date(row.submittedAt).toLocaleString("fr-FR") : "-" },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <Button variant="primary" onClick={() => approveMembership(row.id)}><Check size={15} /> Approuver</Button>
                    <Button variant="danger" onClick={() => openRejectModal("Rejeter le rattachement", row.employee.fullName, reason => rejectMembership(row.id, reason))}><X size={15} /> Rejeter</Button>
                  </div>
                )}
              ]}
            />
          </div>
        ) : tab === "declarations" ? (
          <div className="stack">
            <div className="panel-header">
              <h2>Heures supplémentaires en attente</h2>
              <span className="muted">{declarations.data.overtime.length} demande(s)</span>
            </div>
            <DataTable
              rows={declarations.data.overtime}
              empty="Aucune heure supplémentaire en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => <strong>{row.employee.fullName}</strong>, sortValue: row => row.employee.fullName },
                { key: "date", header: "Jour", render: row => new Date(row.date).toLocaleDateString("fr-FR"), sortValue: row => row.date },
                { key: "hours", header: "Heures", render: row => `${row.hours} h`, sortValue: row => Number(row.hours) },
                { key: "rate", header: "Type", render: row => `${row.ratePercent ?? overtimeRatePercent(row.rateType)}%`, sortValue: row => Number(row.ratePercent ?? overtimeRatePercent(row.rateType)) },
                { key: "reason", header: "Motif", render: row => row.reason || "-" },
                { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-" },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <Button variant="ghost" onClick={() => setDayPreview({ employeeId: row.employee.id, employeeName: row.employee.fullName, date: dateKey(row.date) })}>
                      <CalendarDays size={15} /> Voir journée
                    </Button>
                    <Button variant="primary" onClick={() => approveDeclaration("overtime", row.id)}><Check size={15} /> Approuver</Button>
                    <Button variant="danger" onClick={() => openRejectModal("Rejeter les heures supplémentaires", `${row.employee.fullName} - ${new Date(row.date).toLocaleDateString("fr-FR")}`, reason => rejectDeclaration("overtime", row.id, reason))}><X size={15} /> Rejeter</Button>
                  </div>
                ) }
              ]}
            />
            <div className="panel-header">
              <h2>Compensations en attente</h2>
              <span className="muted">{declarations.data.compensations.length} demande(s)</span>
            </div>
            <DataTable
              rows={declarations.data.compensations}
              empty="Aucune compensation en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => <strong>{row.employee.fullName}</strong>, sortValue: row => row.employee.fullName },
                { key: "absence", header: "Absence", render: row => new Date(row.absenceDate).toLocaleDateString("fr-FR"), sortValue: row => row.absenceDate },
                { key: "comp", header: "Compensé le", render: row => new Date(row.compensationDate).toLocaleDateString("fr-FR"), sortValue: row => row.compensationDate },
                { key: "note", header: "Note", render: row => row.note || "-" },
                { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-" },
                { key: "actions", header: "Actions", render: row => <div className="row-actions"><Button variant="primary" onClick={() => approveDeclaration("compensations", row.id)}><Check size={15} /> Approuver</Button><Button variant="danger" onClick={() => openRejectModal("Rejeter la compensation", `${row.employee.fullName} - absence ${new Date(row.absenceDate).toLocaleDateString("fr-FR")}`, reason => rejectDeclaration("compensations", row.id, reason))}><X size={15} /> Rejeter</Button></div> }
              ]}
            />
            <div className="panel-header">
              <h2>Annulations d'absence sans preuve en attente</h2>
              <span className="muted">{declarations.data.absenceReversals.length} demande(s)</span>
            </div>
            <DataTable
              rows={declarations.data.absenceReversals}
              empty="Aucune annulation d'absence sans preuve en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => <strong>{row.employee.fullName}</strong>, sortValue: row => row.employee.fullName },
                { key: "absence", header: "Jour absent", render: row => new Date(row.absenceDate).toLocaleDateString("fr-FR"), sortValue: row => row.absenceDate },
                { key: "badge", header: "Nature", render: () => <AttendanceStatusBadge status="ABSENCE_REVERSED" /> },
                { key: "reason", header: "Motif", render: row => row.reason },
                { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-" },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <Button variant="ghost" onClick={() => setDayPreview({ employeeId: row.employee.id, employeeName: row.employee.fullName, date: dateKey(row.absenceDate) })}>
                      <CalendarDays size={15} /> Voir journée
                    </Button>
                    <Button variant="primary" onClick={() => approveDeclaration("absence-reversals", row.id)}><Check size={15} /> Approuver</Button>
                    <Button variant="danger" onClick={() => openRejectModal("Rejeter l'annulation d'absence", `${row.employee.fullName} - absence ${new Date(row.absenceDate).toLocaleDateString("fr-FR")}`, reason => rejectDeclaration("absence-reversals", row.id, reason))}><X size={15} /> Rejeter</Button>
                  </div>
                ) }
              ]}
            />
            <div className="panel-header">
              <h2>Maladies en attente</h2>
              <span className="muted">{declarations.data.sickLeaves.length} demande(s)</span>
            </div>
            <DataTable
              rows={declarations.data.sickLeaves}
              empty="Aucune maladie en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => <strong>{row.employee.fullName}</strong>, sortValue: row => row.employee.fullName },
                { key: "start", header: "Du", render: row => new Date(row.dateStart).toLocaleDateString("fr-FR"), sortValue: row => row.dateStart },
                { key: "end", header: "Au", render: row => new Date(row.dateEnd).toLocaleDateString("fr-FR"), sortValue: row => row.dateEnd },
                { key: "note", header: "Note", render: row => row.note || "-" },
                { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-" },
                { key: "actions", header: "Actions", render: row => <div className="row-actions"><Button variant="primary" onClick={() => approveDeclaration("sick-leaves", row.id)}><Check size={15} /> Approuver</Button><Button variant="danger" onClick={() => openRejectModal("Rejeter la maladie", `${row.employee.fullName} - du ${new Date(row.dateStart).toLocaleDateString("fr-FR")}`, reason => rejectDeclaration("sick-leaves", row.id, reason))}><X size={15} /> Rejeter</Button></div> }
              ]}
            />
            <div className="panel-header">
              <h2>Congés en attente</h2>
              <span className="muted">{declarations.data.leaves.length} demande(s)</span>
            </div>
            <DataTable
              rows={declarations.data.leaves}
              empty="Aucun congé en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => <strong>{row.employee.fullName}</strong>, sortValue: row => row.employee.fullName },
                { key: "type", header: "Type", render: row => leaveTypeLabel(row.leaveType), sortValue: row => row.leaveType },
                { key: "reason", header: "Motif", render: row => row.exceptionalReason ? exceptionalReasonLabel(row.exceptionalReason) : "-", sortValue: row => row.exceptionalReason || "" },
                { key: "start", header: "Du", render: row => new Date(row.dateStart).toLocaleDateString("fr-FR"), sortValue: row => row.dateStart },
                { key: "end", header: "Au", render: row => new Date(row.dateEnd).toLocaleDateString("fr-FR"), sortValue: row => row.dateEnd },
                { key: "note", header: "Note", render: row => row.note || "-" },
                { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-" },
                { key: "actions", header: "Actions", render: row => <div className="row-actions"><Button variant="primary" onClick={() => approveDeclaration("leaves", row.id)}><Check size={15} /> Approuver</Button><Button variant="danger" onClick={() => openRejectModal("Rejeter le congé", `${row.employee.fullName} - du ${new Date(row.dateStart).toLocaleDateString("fr-FR")}`, reason => rejectDeclaration("leaves", row.id, reason))}><X size={15} /> Rejeter</Button></div> }
              ]}
            />
          </div>
        ) : (
          <>
            {flags.error && <div className="alert alert-error">Impossible de charger les validations.</div>}
            <DataTable
              rows={flags.data}
              empty="Aucun pointage hors-créneau en attente."
              columns={[
                { key: "employee", header: "Employé", render: row => row.punch.employee.fullName, sortValue: row => row.punch.employee.fullName },
                { key: "department", header: "Département", render: row => row.punch.employee.department || "-", sortValue: row => row.punch.employee.department || "" },
                { key: "time", header: "Pointage", render: row => new Date(row.punch.punchTime).toLocaleString("fr-FR"), sortValue: row => row.punch.punchTime },
                { key: "direction", header: "Sens", render: row => row.punch.direction === "CHECK_IN" ? "Entrée" : row.punch.direction === "CHECK_OUT" ? "Sortie" : "-" },
                { key: "shift", header: "Shift prévu", render: row => row.punch.shift ? `${row.punch.shift.name} ${row.punch.shift.startTime}-${row.punch.shift.endTime}` : "-" },
                { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
                { key: "actions", header: "Actions", render: row => (
                  <div className="row-actions">
                    <Button variant="primary" onClick={() => validate(row.id)}><Check size={15} /> Valider</Button>
                    <Button variant="danger" onClick={() => openRejectModal("Rejeter le pointage", `${row.punch.employee.fullName} - ${new Date(row.punch.punchTime).toLocaleString("fr-FR")}`, reason => reject(row.id, reason))}><X size={15} /> Rejeter</Button>
                  </div>
                )}
              ]}
            />
          </>
        )}
      </section>
      {dayPreview && (
        <div className="modal-backdrop">
          <div className="calendar-modal">
            <div className="modal-header">
              <div>
                <span>Vérification pointage du jour</span>
                <strong>{dayPreview.employeeName} - {new Date(`${dayPreview.date}T00:00:00`).toLocaleDateString("fr-FR")}</strong>
              </div>
              <button className="icon-button" onClick={() => setDayPreview(null)} title="Fermer"><X size={18} /></button>
            </div>
            {previewRows.loading && <LoadingState label="Chargement des pointages du jour..." />}
            {!previewRows.loading && previewRows.data.length === 0 && (
              <div className="empty-state">Aucun pointage trouvé pour ce jour.</div>
            )}
            {previewRows.data.length > 0 && (
              <DataTable
                rows={previewRows.data}
                pageSize={5}
                empty="Aucun pointage trouvé."
                columns={[
                  { key: "date", header: "Jour", render: row => new Date(`${row.workDate}T00:00:00`).toLocaleDateString("fr-FR"), sortValue: row => row.workDate },
                  { key: "first", header: "Premier punch", render: row => formatTime(row.firstPunchTime), sortValue: row => row.firstPunchTime || "" },
                  { key: "last", header: "Dernier punch", render: row => formatTime(row.lastPunchTime), sortValue: row => row.lastPunchTime || "" },
                  { key: "hours", header: "Heures", render: row => row.isIncomplete ? "Incomplet" : `${row.workedHours} h`, sortValue: row => row.workedHours },
                  { key: "count", header: "Punches", render: row => row.punchCount, sortValue: row => row.punchCount },
                  { key: "shift", header: "Shift", render: row => shiftLabel(row.shiftType, row.shiftLabel), sortValue: row => row.shiftType },
                  { key: "device", header: "Terminal", render: row => row.sourceDevice || "-", sortValue: row => row.sourceDevice || "" }
                ]}
              />
            )}
          </div>
        </div>
      )}
      {rejectModal && (
        <div className="modal-backdrop">
          <div className="app-modal reject-modal">
            <div className="modal-header">
              <div>
                <span>Validation RH</span>
                <strong>{rejectModal.title}</strong>
                <small className="muted">{rejectModal.description}</small>
              </div>
              <button className="icon-button" onClick={() => setRejectModal(null)} title="Fermer" disabled={rejectModal.saving}><X size={18} /></button>
            </div>
            <div className="form-grid single">
              <label>
                Motif du rejet
                <textarea
                  autoFocus
                  rows={4}
                  value={rejectModal.reason}
                  onChange={event => setRejectModal(current => current ? { ...current, reason: event.target.value, error: null } : current)}
                  placeholder="Expliquez brièvement la raison du rejet..."
                />
              </label>
            </div>
            {rejectModal.error && <div className="alert alert-error">{rejectModal.error}</div>}
            <div className="modal-actions">
              <Button variant="secondary" onClick={() => setRejectModal(null)} disabled={rejectModal.saving}>Annuler</Button>
              <Button variant="danger" onClick={confirmReject} disabled={rejectModal.saving || !rejectModal.reason.trim()}>
                <X size={15} /> {rejectModal.saving ? "Rejet..." : "Confirmer le rejet"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

type RejectModalState = {
  title: string;
  description: string;
  reason: string;
  saving: boolean;
  error?: string | null;
  onConfirm: (reason: string) => Promise<void>;
};

function dateKey(value: string) {
  return value.slice(0, 10);
}

function formatTime(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
}

function overtimeRatePercent(value: string) {
  if (value === "RATE_75") return 75;
  if (value === "RATE_100") return 100;
  return 50;
}

function groupRequestLabel(row: PlanningApprovals["groups"][number]) {
  if (row.pendingDeleteRequested || row.pendingAction === "DELETE") {
    return <StatusBadge value="REJECTED" label="Suppression demandée" />;
  }
  if (row.pendingName) {
    return (
      <span>
        Renommage: <strong>{row.name}</strong> → <strong>{row.pendingName}</strong>
      </span>
    );
  }
  return "Création / modification";
}

function membershipActionLabel(row: PlanningApprovals["memberships"][number]) {
  if (row.action === "REMOVE") return <StatusBadge value="REJECTED" label="Retrait demandé" />;
  if (row.action === "MOVE") return <StatusBadge value="PENDING_APPROVAL" label="Déplacement demandé" />;
  return <StatusBadge value="APPROVED" label="Ajout demandé" />;
}

function leaveTypeLabel(value: string) {
  if (value === "EXCEPTIONNEL") return "Exceptionnel payé";
  if (value === "SANS_SOLDE") return "Sans solde";
  if (value === "MATERNITE") return "Maternité";
  return "Annuel";
}

function exceptionalReasonLabel(value: string) {
  const labels: Record<string, string> = {
    MARIAGE_EMPLOYE: "Mariage de l'employé",
    NAISSANCE_ENFANT: "Naissance d'un enfant",
    MARIAGE_ENFANT: "Mariage d'un descendant",
    DECES_CONJOINT: "Décès du conjoint",
    DECES_PARENT_PROCHE: "Décès parent proche",
    CIRCONCISION_FILS: "Circoncision du fils",
    HAJJ: "Pèlerinage Hajj"
  };
  return labels[value] || value;
}
