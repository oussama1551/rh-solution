import { FormEvent, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { ShiftAssignmentCalendar } from "../components/ShiftAssignmentCalendar";
import { StatusBadge } from "../components/StatusBadge";
import { PermissionGate, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { AnnualLeaveBalance, Employee, OrgUnit, OvertimeRateType } from "../lib/types";
import { useApi } from "../lib/useApi";

function initials(name?: string | null) {
  const parts = (name || "")
    .split(" ")
    .map(part => part.trim())
    .filter(Boolean);

  return `${parts[0]?.[0] || ""}${parts[1]?.[0] || ""}`.toUpperCase() || "RH";
}

export function EmployeeDetailPage() {
  const { id } = useParams();
  const { user, can } = useAuth();
  const employee = useApi<Employee | null>(id ? `/api/employees/${id}` : null, null);
  const leaveBalance = useApi<AnnualLeaveBalance | null>(id ? `/api/attendance/declarations/leaves/balance?employeeId=${encodeURIComponent(id)}&year=${new Date().getFullYear()}` : null, null);
  const [photoAttempt, setPhotoAttempt] = useState<"direct" | "proxy" | "failed">("direct");
  const confirmedSap = employee.data?.sapMappings?.find(mapping => mapping.status === "confirmed");
  const sapMetadata = confirmedSap?.metadata || null;
  const sapDirectoryRecord = employee.data?.sapDirectoryRecords?.[0];
  const employeePhotoUrl = photoAttempt === "direct" ? employee.data?.photoUrl : employee.data?.photoProxyUrl;
  const employeePhone = employee.data?.sapPhone || employee.data?.displayPhone || employee.data?.phone || "-";
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const [unitId, setUnitId] = useState("");
  const [subUnitId, setSubUnitId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [orgMessage, setOrgMessage] = useState<string | null>(null);
  const [declarationMessage, setDeclarationMessage] = useState<string | null>(null);
  const [declarationError, setDeclarationError] = useState<string | null>(null);
  const [overtime, setOvertime] = useState<{ date: string; hours: string; rateType: OvertimeRateType; reason: string }>({ date: dateKey(new Date()), hours: "2", rateType: "RATE_50", reason: "" });
  const [sickLeave, setSickLeave] = useState({ dateStart: dateKey(new Date()), dateEnd: dateKey(new Date()), note: "" });
  const [leave, setLeave] = useState({ dateStart: dateKey(new Date()), dateEnd: dateKey(new Date()), note: "" });
  const selectedUnit = orgTree.data.find(unit => unit.id === unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === subUnitId) || null;

  useEffect(() => {
    setPhotoAttempt("direct");
  }, [employee.data?.photoUrl]);

  useEffect(() => {
    const group = employee.data?.group;
    setUnitId(group?.subUnit?.unit?.id || "");
    setSubUnitId(group?.subUnit?.id || "");
    setGroupId(group?.id || "");
  }, [employee.data?.groupId]);

  async function saveGroup() {
    if (!employee.data) return;
    await api(`/api/org/employees/${employee.data.id}/group`, {
      method: "PATCH",
      body: JSON.stringify({ groupId: groupId || null })
    });
    setOrgMessage("Rattachement organigramme mis à jour.");
    employee.reload();
    orgTree.reload();
  }

  async function submitOvertime(event: FormEvent) {
    event.preventDefault();
    if (!employee.data) return;
    setDeclarationMessage(null);
    setDeclarationError(null);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/overtime", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employee.data.id,
          date: overtime.date,
          hours: Number(overtime.hours),
          rateType: overtime.rateType,
          reason: overtime.reason
        })
      });
      setDeclarationMessage(result.status === "PENDING_APPROVAL" ? "Heures supplémentaires envoyées en validation." : "Heures supplémentaires approuvées et enregistrées.");
      setOvertime(current => ({ ...current, reason: "" }));
    } catch (error) {
      setDeclarationError(error instanceof Error ? error.message : "Déclaration impossible.");
    }
  }

  async function submitSickLeave(event: FormEvent) {
    event.preventDefault();
    if (!employee.data) return;
    setDeclarationMessage(null);
    setDeclarationError(null);
    try {
      await api("/api/attendance/declarations/sick-leaves", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employee.data.id,
          dateStart: sickLeave.dateStart,
          dateEnd: sickLeave.dateEnd,
          note: sickLeave.note
        })
      });
      setDeclarationMessage("Maladie déclarée.");
      setSickLeave(current => ({ ...current, note: "" }));
    } catch (error) {
      setDeclarationError(error instanceof Error ? error.message : "Déclaration maladie impossible.");
    }
  }

  async function submitLeave(event: FormEvent) {
    event.preventDefault();
    if (!employee.data) return;
    setDeclarationMessage(null);
    setDeclarationError(null);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/leaves", {
        method: "POST",
        body: JSON.stringify({
          employeeId: employee.data.id,
          leaveType: "ANNUEL",
          dateStart: leave.dateStart,
          dateEnd: leave.dateEnd,
          note: leave.note
        })
      });
      setDeclarationMessage(result.status === "PENDING_APPROVAL" ? "Congé envoyé en validation." : "Congé déclaré.");
      setLeave(current => ({ ...current, note: "" }));
    } catch (error) {
      setDeclarationError(error instanceof Error ? error.message : "Déclaration congé impossible.");
    }
  }

  function handlePhotoError() {
    if (photoAttempt === "direct" && employee.data?.photoProxyUrl) {
      setPhotoAttempt("proxy");
      return;
    }

    setPhotoAttempt("failed");
  }

  return (
    <>
      <PageHeader title={employee.data?.fullName || "Fiche employé"} backTo="/employees" backLabel="Retour aux employés" />
      <section className="panel">
        {employee.error && <div className="alert">La fiche est prête pour `/api/employees/:id`.</div>}
        {employee.data ? (
          <>
            <div className="employee-profile-card">
              <div className="employee-photo" aria-label="Photo BioTime">
                {employeePhotoUrl && photoAttempt !== "failed" ? (
                  <img
                    src={employeePhotoUrl}
                    alt={employee.data.fullName}
                    onError={handlePhotoError}
                  />
                ) : (
                  <span>{initials(employee.data.fullName)}</span>
                )}
              </div>
              <div>
                <span>Photo source BioTime</span>
                <strong>{employee.data.fullName}</strong>
                <small>{employee.data.photoUrl ? "Image synchronisée depuis BioTime" : "Aucune image BioTime disponible"}</small>
              </div>
            </div>
            <div className="detail-grid">
              <div><span>Matricule affiché</span><strong>{employee.data.localMatricule || employee.data.biotimeCode || employee.data.employeeCode}</strong></div>
              <div><span>Code BioTime source</span><strong>{employee.data.biotimeCode || employee.data.employeeCode}</strong></div>
              <div><span>ID interne BioTime</span><strong>{employee.data.zktecoId}</strong></div>
              <div><span>Statut</span><StatusBadge value={employee.data.status} /></div>
              <div><span>Département</span><strong>{employee.data.department || "-"}</strong></div>
              <div><span>Téléphone SAP</span><strong>{employeePhone}</strong></div>
              <div><span>Matricule SAP</span><strong>{confirmedSap?.sapEmpId || "-"}</strong></div>
              <div><span>Société SAP</span><strong>{sapDirectoryRecord?.sapCompany || sapMetadata?.company || "-"}</strong></div>
              <div><span>Structure SAP</span><strong>{sapDirectoryRecord?.structure || sapMetadata?.Structure || "-"}</strong></div>
              <div><span>Poste SAP</span><strong>{sapDirectoryRecord?.poste || sapMetadata?.Poste || "-"}</strong></div>
              <div><span>Organigramme</span><strong>{employee.data.group ? `${employee.data.group.subUnit?.unit?.name || "-"} > ${employee.data.group.subUnit?.name || "-"} > ${employee.data.group.name}` : "Non rattaché"}</strong></div>
            </div>
            <PermissionGate permission="org.manage">
              <div className="org-assignment-panel">
                {orgMessage && <div className="alert alert-success">{orgMessage}</div>}
                <label className="filter-field">
                  <span>Unité</span>
                  <select value={unitId} onChange={event => { setUnitId(event.target.value); setSubUnitId(""); setGroupId(""); }}>
                    <option value="">Non rattaché</option>
                    {orgTree.data.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
                  </select>
                </label>
                <label className="filter-field">
                  <span>Sous-unité</span>
                  <select value={subUnitId} onChange={event => { setSubUnitId(event.target.value); setGroupId(""); }} disabled={!selectedUnit}>
                    <option value="">Choisir...</option>
                    {selectedUnit?.subUnits.map(subUnit => <option key={subUnit.id} value={subUnit.id}>{subUnit.name}</option>)}
                  </select>
                </label>
                <label className="filter-field">
                  <span>Groupe</span>
                  <select value={groupId} onChange={event => setGroupId(event.target.value)} disabled={!selectedSubUnit}>
                    <option value="">Choisir...</option>
                    {selectedSubUnit?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
                  </select>
                </label>
                <Button variant="primary" onClick={saveGroup}>Enregistrer rattachement</Button>
              </div>
            </PermissionGate>
            <ShiftAssignmentCalendar target={{ employeeId: employee.data.id }} title="Planning individuel" readOnly={!can("shifts.manage")} />
            {leaveBalance.data && (
              <div className="attendance-summary-strip compact">
                <div><span>Congé annuel {leaveBalance.data.year}</span><strong>{formatDays(leaveBalance.data.daysEntitled)} j</strong></div>
                <div><span>Pris</span><strong>{formatDays(leaveBalance.data.daysTaken)} j</strong></div>
                <div className={Number(leaveBalance.data.daysRemaining) < 0 ? "summary-warning" : ""}><span>Restant</span><strong>{formatDays(leaveBalance.data.daysRemaining)} j</strong></div>
              </div>
            )}
            <div className="declaration-grid">
              <form className="quick-create declaration-card" onSubmit={submitOvertime}>
                <strong>Ajouter des heures supplémentaires</strong>
                {declarationMessage && <div className="alert alert-success">{declarationMessage}</div>}
                {declarationError && <div className="alert alert-error">{declarationError}</div>}
                <label className="filter-field">
                  <span>Jour</span>
                  <input type="date" value={overtime.date} onChange={event => setOvertime(current => ({ ...current, date: event.target.value }))} />
                </label>
                <label className="filter-field">
                  <span>Heures</span>
                  <input type="number" min="0.25" max="24" step="0.25" value={overtime.hours} onChange={event => setOvertime(current => ({ ...current, hours: event.target.value }))} />
                </label>
                <label className="filter-field">
                  <span>Type</span>
                  <select value={overtime.rateType} onChange={event => setOvertime(current => ({ ...current, rateType: event.target.value as OvertimeRateType }))}>
                    <option value="RATE_50" title="50% : heures sup. de jour en semaine">50%</option>
                    <option value="RATE_75" title="75% : heures sup. de nuit ou dimanche">75%</option>
                    <option value="RATE_100" title="100% : jour férié">100%</option>
                  </select>
                  <small className="muted">{overtimeRateHint(overtime.rateType)}</small>
                </label>
                <label className="filter-field">
                  <span>Motif</span>
                  <input value={overtime.reason} onChange={event => setOvertime(current => ({ ...current, reason: event.target.value }))} placeholder="Optionnel" />
                </label>
                <Button variant="primary" type="submit">Enregistrer</Button>
              </form>
              {user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)) && (
                <form className="quick-create declaration-card" onSubmit={submitSickLeave}>
                  <strong>Déclarer une maladie</strong>
                  <label className="filter-field">
                    <span>Du</span>
                    <input type="date" value={sickLeave.dateStart} onChange={event => setSickLeave(current => ({ ...current, dateStart: event.target.value }))} />
                  </label>
                  <label className="filter-field">
                    <span>Au</span>
                    <input type="date" value={sickLeave.dateEnd} onChange={event => setSickLeave(current => ({ ...current, dateEnd: event.target.value }))} />
                  </label>
                  <label className="filter-field">
                    <span>Référence / note</span>
                    <input value={sickLeave.note} onChange={event => setSickLeave(current => ({ ...current, note: event.target.value }))} placeholder="Optionnel" />
                  </label>
                  <Button variant="primary" type="submit">Déclarer</Button>
                </form>
              )}
              {user?.roles.some(role => ["ADMIN", "DRH", "GRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"].includes(role)) && (
                <form className="quick-create declaration-card" onSubmit={submitLeave}>
                  <strong>Déclarer un congé</strong>
                  <label className="filter-field">
                    <span>Du</span>
                    <input type="date" value={leave.dateStart} onChange={event => setLeave(current => ({ ...current, dateStart: event.target.value }))} />
                  </label>
                  <label className="filter-field">
                    <span>Au</span>
                    <input type="date" value={leave.dateEnd} onChange={event => setLeave(current => ({ ...current, dateEnd: event.target.value }))} />
                  </label>
                  <label className="filter-field">
                    <span>Référence / note</span>
                    <input value={leave.note} onChange={event => setLeave(current => ({ ...current, note: event.target.value }))} placeholder="Optionnel" />
                  </label>
                  <Button variant="primary" type="submit">Déclarer</Button>
                </form>
              )}
            </div>
          </>
        ) : <div className="empty-state">Sélectionnez un employé depuis la liste.</div>}
      </section>
    </>
  );
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function overtimeRateHint(rateType: OvertimeRateType) {
  if (rateType === "RATE_75") return "75% : heures sup. de nuit ou dimanche";
  if (rateType === "RATE_100") return "100% : jour férié";
  return "50% : heures sup. de jour en semaine";
}

function formatDays(value: string | number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}
