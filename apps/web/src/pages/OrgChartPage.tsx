import { Building2, ChevronRight, Printer, Search, Trash2, Users } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { ApprovalStatusBadge } from "../components/ApprovalStatusBadge";
import { ShiftAssignmentCalendar } from "../components/ShiftAssignmentCalendar";
import { StatusBadge } from "../components/StatusBadge";
import { PermissionGate, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { OrgEmployee, OrgGroup, OrgSubUnit, OrgUnit, ShiftPlanningPrint } from "../lib/types";
import { useApi } from "../lib/useApi";

type Level = "units" | "subUnits" | "groups" | "employees";

export function OrgChartPage() {
  const tree = useApi<OrgUnit[]>("/api/org/tree", []);
  const [selectedUnitId, setSelectedUnitId] = useState<string | null>(null);
  const [selectedSubUnitId, setSelectedSubUnitId] = useState<string | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  const selectedUnit = tree.data.find(unit => unit.id === selectedUnitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === selectedSubUnitId) || null;
  const selectedGroup = selectedSubUnit?.groups.find(group => group.id === selectedGroupId) || null;
  const level: Level = selectedGroup ? "employees" : selectedSubUnit ? "groups" : selectedUnit ? "subUnits" : "units";

  useEffect(() => {
    if (!tree.data.length) return;

    if (selectedUnitId && !selectedUnit) {
      setSelectedUnitId(null);
      setSelectedSubUnitId(null);
      setSelectedGroupId(null);
      return;
    }

    if (selectedSubUnitId && selectedUnit && !selectedSubUnit) {
      setSelectedSubUnitId(null);
      setSelectedGroupId(null);
      return;
    }

    if (selectedGroupId && selectedSubUnit && !selectedGroup) {
      setSelectedGroupId(null);
    }
  }, [tree.data, selectedUnitId, selectedSubUnitId, selectedGroupId, selectedUnit, selectedSubUnit, selectedGroup]);

  function reload() {
    tree.reload();
  }

  function goToGroups() {
    setSelectedGroupId(null);
    reload();
  }

  return (
    <>
      <PageHeader title="Organigramme" />
      <section className="panel">
        <div className="breadcrumb">
          <button onClick={() => { setSelectedUnitId(null); setSelectedSubUnitId(null); setSelectedGroupId(null); }}>Unités</button>
          {selectedUnit && <><ChevronRight size={14} /><button onClick={() => { setSelectedSubUnitId(null); setSelectedGroupId(null); }}>{selectedUnit.name}</button></>}
          {selectedSubUnit && <><ChevronRight size={14} /><button onClick={() => setSelectedGroupId(null)}>{selectedSubUnit.name}</button></>}
          {selectedGroup && <><ChevronRight size={14} /><span>{selectedGroup.name}</span></>}
        </div>

        {level === "units" && <UnitsView units={tree.data} onSelect={unit => setSelectedUnitId(unit.id)} />}
        {level === "subUnits" && selectedUnit && <SubUnitsView unit={selectedUnit} onSelect={subUnit => setSelectedSubUnitId(subUnit.id)} onCreated={reload} />}
        {level === "groups" && selectedSubUnit && <GroupsView subUnit={selectedSubUnit} onSelect={group => setSelectedGroupId(group.id)} onCreated={reload} />}
        {level === "employees" && selectedGroup && <GroupEmployeesView group={selectedGroup} onChanged={reload} onDeleted={goToGroups} />}
      </section>
    </>
  );
}

function UnitsView({ units, onSelect }: { units: OrgUnit[]; onSelect: (unit: OrgUnit) => void }) {
  return (
    <div className="org-card-grid">
      {units.map(unit => (
        <button key={unit.id} className="org-card" onClick={() => onSelect(unit)}>
          <Building2 size={20} />
          <strong>{unit.name}</strong>
          <span>{unit.code}</span>
          <StatusBadge value="ACTIVE" label={`${unit.employeeCount} employé(s)`} />
        </button>
      ))}
    </div>
  );
}

function SubUnitsView({ unit, onSelect, onCreated }: { unit: OrgUnit; onSelect: (subUnit: OrgSubUnit) => void; onCreated: () => void }) {
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function deleteSubUnit(subUnit: OrgSubUnit) {
    const password = window.prompt("Mot de passe suppression sous-unité");
    if (password !== "2620") {
      if (password !== null) setError("Mot de passe incorrect.");
      return;
    }
    if (!window.confirm(`Supprimer la sous-unité "${subUnit.name}" ? Elle doit être vide de groupes.`)) return;
    setMessage(null);
    setError(null);
    setDeletingId(subUnit.id);
    try {
      await api(`/api/org/sub-units/${subUnit.id}`, { method: "DELETE" });
      setMessage(`Sous-unité "${subUnit.name}" supprimée.`);
      onCreated();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Suppression impossible.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <>
      <PermissionGate permission="org.structure.manage">
        <QuickCreate
          label="Nouvelle sous-unité"
          placeholder="FAB PRODUCTION"
          onSubmit={name => api("/api/org/sub-units", { method: "POST", body: JSON.stringify({ unitId: unit.id, name }) }).then(onCreated)}
        />
      </PermissionGate>
      {message && <div className="alert alert-success">{message}</div>}
      {error && <div className="alert alert-error">{error}</div>}
      <div className="org-card-grid">
        {unit.subUnits.map(subUnit => (
          <div key={subUnit.id} className="org-card org-card-with-actions">
            <Building2 size={20} />
            <strong>{subUnit.name}</strong>
            <span>{unit.name}</span>
            <StatusBadge value="ACTIVE" label={`${subUnit.employeeCount} employé(s)`} />
            <div className="row-actions">
              <Button variant="secondary" onClick={() => onSelect(subUnit)}>Ouvrir</Button>
              <PermissionGate permission="org.structure.manage">
                <Button variant="ghost" className="btn-delete-compact" disabled={deletingId === subUnit.id} onClick={() => deleteSubUnit(subUnit)}>
                  <Trash2 size={15} />Supprimer
                </Button>
              </PermissionGate>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function GroupsView({ subUnit, onSelect, onCreated }: { subUnit: OrgSubUnit; onSelect: (group: OrgGroup) => void; onCreated: () => void }) {
  const printData = useApi<ShiftPlanningPrint>(`/api/attendance/shift-planning/print?subUnitId=${subUnit.id}`, null as never);

  function printAllGroups() {
    triggerPlanningPrint();
  }

  return (
    <>
      <PermissionGate permission="org.manage">
        <QuickCreate
          label="Nouveau groupe"
          placeholder="Équipe A - Production"
          onSubmit={name => api("/api/org/groups", { method: "POST", body: JSON.stringify({ subUnitId: subUnit.id, name }) }).then(onCreated)}
        />
      </PermissionGate>
      <div className="row-actions org-print-actions">
        <Button variant="secondary" onClick={printAllGroups} disabled={printData.loading || !printData.data?.groups.length}>
          <Printer size={16} /> Imprimer tous les groupes
        </Button>
      </div>
      {printData.data && <PlanningPrintDocument data={printData.data} mode="all" />}
      <div className="org-card-grid">
        {subUnit.groups.map(group => (
          <button key={group.id} className="org-card" onClick={() => onSelect(group)}>
            <Users size={20} />
            <strong>{group.name}</strong>
            <span>{subUnit.name}</span>
            {group.createdBy && <small className="muted">Créé par {group.createdBy.fullName || group.createdBy.username}</small>}
            <ApprovalStatusBadge
              status={group.status || "DRAFT"}
              submittedAt={group.submittedAt}
              submittedBy={group.submittedBy}
              reviewedAt={group.reviewedAt}
              reviewedBy={group.reviewedBy}
              rejectionReason={group.rejectionReason}
              compact
            />
            <StatusBadge value="ACTIVE" label={`${group.employeeCount} employé(s)`} />
          </button>
        ))}
      </div>
    </>
  );
}

function GroupEmployeesView({ group, onChanged, onDeleted }: { group: OrgGroup; onChanged: () => void; onDeleted: () => void }) {
  const { can } = useAuth();
  const employees = useApi<OrgEmployee[]>(`/api/org/groups/${group.id}/employees`, []);
  const printData = useApi<ShiftPlanningPrint>(`/api/attendance/shift-planning/print?groupId=${group.id}`, null as never);
  const [search, setSearch] = useState("");
  const [groupName, setGroupName] = useState(group.name);
  const [renaming, setRenaming] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [groupMessage, setGroupMessage] = useState<string | null>(null);
  const [employeeMessage, setEmployeeMessage] = useState<string | null>(null);
  const [employeeError, setEmployeeError] = useState<string | null>(null);
  const [movingEmployeeId, setMovingEmployeeId] = useState<string | null>(null);
  const searchPath = search.trim().length >= 2 ? `/api/org/employees/search?q=${encodeURIComponent(search)}` : null;
  const candidates = useApi<OrgEmployee[]>(searchPath, []);
  const canManageOrg = can("org.manage");
  const canManagePlanning = can("shifts.manage");

  useEffect(() => {
    setGroupName(group.name);
    setGroupMessage(null);
  }, [group.id, group.name]);

  async function moveEmployee(employee: OrgEmployee, targetGroupId: string | null) {
    setMovingEmployeeId(employee.id);
    setEmployeeMessage(null);
    setEmployeeError(null);
    try {
      const result = await api<{ pendingApproval?: boolean; unchanged?: boolean }>(`/api/org/employees/${employee.id}/group`, {
        method: "PATCH",
        body: JSON.stringify({ groupId: targetGroupId })
      });
      if (result.unchanged) {
        setEmployeeMessage(`${employee.fullName} est déjà dans cet état.`);
      } else if (result.pendingApproval) {
        setEmployeeMessage(targetGroupId
          ? `Demande d'ajout de ${employee.fullName} envoyée. En attente de validation Admin/DRH.`
          : `Demande de retrait de ${employee.fullName} envoyée. En attente de validation Admin/DRH.`);
      } else {
        setEmployeeMessage(targetGroupId
          ? `${employee.fullName} ajouté au groupe ${group.name}.`
          : `${employee.fullName} retiré du groupe ${group.name}.`);
      }
      setSearch("");
      employees.reload();
      onChanged();
    } catch (error) {
      setEmployeeError(error instanceof Error ? error.message : "Modification du groupe impossible.");
    } finally {
      setMovingEmployeeId(null);
    }
  }

  async function renameGroup(event: FormEvent) {
    event.preventDefault();
    const name = groupName.trim();
    if (!name || name === group.name) return;
    setRenaming(true);
    try {
      const updated = await api<OrgGroup>(`/api/org/groups/${group.id}`, {
        method: "PATCH",
        body: JSON.stringify({ name })
      });
      setGroupMessage(updated.status === "PENDING_APPROVAL"
        ? `Demande de renommage envoyée: "${group.name}" → "${name}". En attente de validation.`
        : "Nom du groupe enregistré et actif.");
      onChanged();
    } finally {
      setRenaming(false);
    }
  }

  async function deleteGroup() {
    const password = window.prompt("Mot de passe suppression groupe");
    if (password !== "2620") {
      if (password !== null) window.alert("Mot de passe incorrect.");
      return;
    }

    const confirmation = window.confirm(`Supprimer le groupe "${group.name}" ? Les employés seront retirés du groupe.`);
    if (!confirmation) return;

    setDeleting(true);
    try {
      const result = await api<{ deleted?: boolean; pendingDelete?: boolean; status?: string }>(`/api/org/groups/${group.id}?force=true`, { method: "DELETE" });
      if (result.pendingDelete || result.status === "PENDING_APPROVAL") {
        setGroupMessage("Demande de suppression envoyée. Le groupe restera actif jusqu'à validation Admin/DRH.");
        onChanged();
      } else {
        onDeleted();
      }
    } finally {
      setDeleting(false);
    }
  }

  const selectable = useMemo(() => candidates.data.filter(employee => employee.id && employee.groupId !== group.id), [candidates.data, group.id]);

  function printGroup() {
    triggerPlanningPrint();
  }

  return (
    <>
      <div className="approval-panel">
        <strong>Statut du groupe</strong>
        <ApprovalStatusBadge
          status={group.status || "DRAFT"}
          submittedAt={group.submittedAt}
          submittedBy={group.submittedBy}
          reviewedAt={group.reviewedAt}
          reviewedBy={group.reviewedBy}
          rejectionReason={group.rejectionReason}
        />
        {group.pendingName && <span className="muted">Nom proposé: {group.pendingName}</span>}
        {group.pendingDeleteRequested && <span className="text-danger">Suppression demandée, en attente de validation.</span>}
        {!canManageOrg && <span className="muted">Consultation uniquement.</span>}
      </div>
      {groupMessage && <div className="alert alert-success">{groupMessage}</div>}
      <div className="row-actions org-print-actions">
        <Button variant="secondary" type="button" onClick={printGroup} disabled={printData.loading || !printData.data?.groups.length}>
          <Printer size={16} /> Imprimer planning
        </Button>
      </div>
      {printData.data && <PlanningPrintDocument data={printData.data} mode="single" />}
      <ShiftAssignmentCalendar target={{ groupId: group.id }} title={`Planning du groupe - ${group.name}`} readOnly={!canManagePlanning} />
      <PermissionGate permission="org.manage">
        <form className="quick-create group-edit-form" onSubmit={renameGroup}>
          <label className="filter-field">
            <span>Nom du groupe</span>
            <input value={groupName} onChange={event => setGroupName(event.target.value)} placeholder="Nom du groupe" />
          </label>
          <Button variant="secondary" type="submit" disabled={renaming || !groupName.trim() || groupName.trim() === group.name}>Renommer</Button>
          <Button variant="ghost" type="button" className="btn-delete-compact" onClick={deleteGroup} disabled={deleting}><Trash2 size={16} />Demander suppression</Button>
        </form>
        <div className="org-add-panel">
          {employeeMessage && <div className="alert alert-success">{employeeMessage}</div>}
          {employeeError && <div className="alert alert-error">{employeeError}</div>}
          <label className="filter-field">
            <span>Ajouter un employé à ce groupe</span>
            <div className="input-icon"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Nom, code BioTime, matricule..." /></div>
          </label>
          {selectable.length > 0 && (
            <div className="org-candidate-list">
              {selectable.map(employee => (
                <div key={employee.id}>
                  <div>
                    <strong>{employee.fullName}</strong>
                    <span>{employee.localMatricule || employee.biotimeCode || employee.employeeCode} {employee.group ? `- actuellement ${employee.group.name}` : "- non rattaché"}</span>
                  </div>
                  <Button variant="secondary" onClick={() => {
                    if (!employee.group || window.confirm(`${employee.fullName} est déjà dans ${employee.group.name}. Confirmer le déplacement ?`)) {
                      moveEmployee(employee, group.id);
                    }
                  }} disabled={movingEmployeeId === employee.id}>{movingEmployeeId === employee.id ? "Ajout..." : "Ajouter"}</Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </PermissionGate>
      <DataTable
        rows={employees.data}
        empty="Aucun employé dans ce groupe."
        columns={[
          { key: "code", header: "Matricule", render: row => row.localMatricule || row.biotimeCode || row.employeeCode, sortValue: row => row.localMatricule || row.biotimeCode || row.employeeCode },
          { key: "name", header: "Employé", render: row => row.fullName, sortValue: row => row.fullName },
          { key: "department", header: "Département BioTime", render: row => row.department || "-", sortValue: row => row.department || "" },
          { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
          { key: "actions", header: "Actions", render: row => (
            <PermissionGate permission="org.manage">
              <Button variant="ghost" disabled={movingEmployeeId === row.id} onClick={() => moveEmployee(row, null)}>
                {movingEmployeeId === row.id ? "Retrait..." : "Retirer"}
              </Button>
            </PermissionGate>
          ) }
        ]}
      />
    </>
  );
}

function PlanningPrintDocument({ data, mode }: { data: ShiftPlanningPrint; mode: "single" | "all" }) {
  const weeks = chunkDays(data.period.days, 7);
  return (
    <div className="print-root planning-print">
      {weeks.flatMap((week, weekIndex) => data.groups.map(group => (
        <section key={`${group.id}-${weekIndex}`} className="weekly-planning-block">
          <div className="weekly-planning-title">
            <div className="print-brand">
              <strong>{group.unitName}</strong>
              <span>RH Solution</span>
            </div>
            <div className="print-title-center">
              <span>Répartition Personnel Hebdomadaire</span>
              <strong>{group.subUnitName}</strong>
            </div>
            <div className="print-week-meta">
              <span>{weekLabel(week)}</span>
              <small>{mode === "single" ? group.name : `${group.name} - ${data.period.key}`}</small>
            </div>
          </div>
          <table className="weekly-planning-table">
            <thead>
              <tr>
                <th className="group-head">{group.name}</th>
                <th className="employee-head">الاسم واللقب</th>
                {week.map(day => (
                  <th key={day}>
                    <span>{formatPrintDate(day)}</span>
                    <small>{formatPrintWeekday(day)}</small>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.employees.map((employee, index) => (
                <tr key={employee.id}>
                  {index === 0 && <td className="group-side" rowSpan={Math.max(group.employees.length, 1)}>{group.name}</td>}
                  <td className="employee-name"><strong>{employee.fullName}</strong><small>{employee.code}</small></td>
                  {week.map(day => {
                    const cell = employee.days.find(item => item.date === day);
                    return (
                      <td key={day} className={`weekly-shift weekly-shift-${(cell?.shiftType || "empty").toLowerCase()} ${cell?.approvalStatus === "PENDING_APPROVAL" ? "print-pending" : ""}`}>
                        {shiftPrintLabel(cell?.shiftType || null)}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {group.employees.length === 0 && (
                <tr>
                  <td className="group-side">{group.name}</td>
                  <td className="employee-name">Aucun employé</td>
                  {week.map(day => <td key={day}>-</td>)}
                </tr>
              )}
            </tbody>
          </table>
          <div className="weekly-shift-legend">
            <span>صباحا 07h00 إلى 15h00</span>
            <span>مساءا 15h00 إلى 23h00</span>
            <span>ليلا 23h00 إلى 07h00</span>
            <span>راحة = repos</span>
            <span>* en attente de validation</span>
          </div>
        </section>
      )))}
    </div>
  );
}

function chunkDays(days: string[], size: number) {
  const chunks: string[][] = [];
  for (let index = 0; index < days.length; index += size) {
    chunks.push(days.slice(index, index + size));
  }
  return chunks;
}

function weekLabel(days: string[]) {
  return `${formatPrintDate(days[0])} - ${formatPrintDate(days[days.length - 1])}`;
}

function formatPrintDate(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("fr-FR");
}

function formatPrintWeekday(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return date.toLocaleDateString("ar-DZ", { weekday: "long" });
}

function shiftPrintLabel(type: string | null) {
  if (type === "MORNING") return "صباحا";
  if (type === "EVENING") return "مساءا";
  if (type === "NIGHT") return "ليلا";
  if (type === "REPOS") return "راحة";
  if (type === "FLEXIBLE") return "عادي";
  return "";
}

function triggerPlanningPrint() {
  document.body.dataset.printMode = "planning";
  const cleanup = () => {
    delete document.body.dataset.printMode;
    window.removeEventListener("afterprint", cleanup);
  };
  window.addEventListener("afterprint", cleanup);
  window.setTimeout(() => window.print(), 50);
  window.setTimeout(cleanup, 1500);
}

function QuickCreate({ label, placeholder, onSubmit }: { label: string; placeholder: string; onSubmit: (name: string) => Promise<unknown> }) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setMessage(null);
    setError(null);
    try {
      await onSubmit(name.trim());
      setMessage(`${label} créée.`);
      setName("");
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Création impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form className="quick-create" onSubmit={submit}>
      <label className="filter-field">
        <span>{label}</span>
        <input value={name} onChange={event => setName(event.target.value)} placeholder={placeholder} />
      </label>
      <Button variant="primary" type="submit" disabled={saving}>Créer</Button>
      {message && <div className="alert alert-success quick-create-feedback">{message}</div>}
      {error && <div className="alert alert-error quick-create-feedback">{error}</div>}
    </form>
  );
}
