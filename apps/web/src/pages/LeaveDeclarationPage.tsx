import { CalendarPlus, Search, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { AnnualLeaveBalance, Employee, ExceptionalLeaveReason, LeaveDeclaration, LeaveType } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function LeaveDeclarationPage() {
  const { user } = useAuth();
  const employees = useApi<Employee[]>("/api/employees", []);
  const { filters, update, reset } = useSessionFilters("leave.declaration.filters", {
    search: "",
    employeeId: "",
    leaveType: "ANNUEL" as LeaveType,
    exceptionalReason: "" as "" | ExceptionalLeaveReason,
    dateStart: dateKey(new Date()),
    dateEnd: dateKey(new Date()),
    note: ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const historyPath = filters.employeeId
    ? `/api/attendance/declarations/leaves?employeeId=${encodeURIComponent(filters.employeeId)}`
    : "/api/attendance/declarations/leaves";
  const history = useApi<LeaveDeclaration[]>(historyPath, []);
  const balanceYear = Number(filters.dateStart.slice(0, 4)) || new Date().getFullYear();
  const balance = useApi<AnnualLeaveBalance | null>(
    filters.employeeId ? `/api/attendance/declarations/leaves/balance?employeeId=${encodeURIComponent(filters.employeeId)}&year=${balanceYear}` : null,
    null
  );

  const filteredEmployees = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return employees.data;
    return employees.data.filter(employee => {
      const code = employee.localMatricule || employee.biotimeCode || employee.employeeCode || "";
      return `${employee.fullName} ${code} ${employee.department || ""}`.toLowerCase().includes(search);
    });
  }, [employees.data, filters.search]);

  const selectedEmployee = employees.data.find(employee => employee.id === filters.employeeId) || null;
  const isAdmin = Boolean(user?.roles.includes("ADMIN"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!filters.employeeId) {
      setError("Choisissez un employé avant d'enregistrer.");
      return;
    }
    if (filters.dateEnd < filters.dateStart) {
      setError("La date de fin doit être après la date de début.");
      return;
    }

    setSaving(true);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/leaves", {
        method: "POST",
        body: JSON.stringify({
          employeeId: filters.employeeId,
          leaveType: filters.leaveType,
          exceptionalReason: filters.leaveType === "EXCEPTIONNEL" ? filters.exceptionalReason || undefined : undefined,
          dateStart: filters.dateStart,
          dateEnd: filters.dateEnd,
          note: filters.note
        })
      });
      setMessage(result.status === "PENDING_APPROVAL" ? "Congé envoyé en validation." : "Congé enregistré. Il apparaîtra dans la synthèse après régénération de la période.");
      update({ note: "" });
      history.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Déclaration congé impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteLeave(row: LeaveDeclaration) {
    setMessage(null);
    setError(null);
    const label = `${row.employee.fullName} - ${formatDate(row.dateStart)} au ${formatDate(row.dateEnd)}`;
    if (!window.confirm(`Supprimer cette déclaration congé ?\n${label}`)) return;

    try {
      await api(`/api/attendance/declarations/leaves/${row.id}`, { method: "DELETE" });
      setMessage("Déclaration congé supprimée. Régénérez la synthèse paie si elle était déjà calculée.");
      history.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.");
    }
  }

  return (
    <>
      <PageHeader title="Déclarer congé" />
      <section className="panel">
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche employé">
            <div className="input-icon">
              <Search size={15} />
              <input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule, département..." />
            </div>
          </FilterField>
          <FilterField label="Employé">
            <select value={filters.employeeId} onChange={event => update({ employeeId: event.target.value })}>
              <option value="">Choisir...</option>
              {filteredEmployees.map(employee => (
                <option key={employee.id} value={employee.id}>
                  {(employee.localMatricule || employee.biotimeCode || employee.employeeCode)} - {employee.fullName}
                </option>
              ))}
            </select>
          </FilterField>
        </FiltersBar>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <form className="quick-create declaration-card" onSubmit={submit}>
          <strong><CalendarPlus size={16} /> Déclaration congé</strong>
          <label className="filter-field">
            <span>Type de congé</span>
            <select value={filters.leaveType} onChange={event => update({ leaveType: event.target.value as LeaveType, exceptionalReason: "" })}>
              <option value="ANNUEL">Annuel</option>
              <option value="EXCEPTIONNEL">Exceptionnel payé</option>
              <option value="SANS_SOLDE">Sans solde</option>
              <option value="MATERNITE">Maternité</option>
            </select>
          </label>
          {filters.leaveType === "EXCEPTIONNEL" && (
            <label className="filter-field">
              <span>Motif exceptionnel</span>
              <select value={filters.exceptionalReason} onChange={event => update({ exceptionalReason: event.target.value as ExceptionalLeaveReason })}>
                <option value="">Choisir...</option>
                {Object.entries(exceptionalReasonLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
          )}
          {selectedEmployee && (
            <div className="detail-grid compact">
              <div><span>Employé</span><strong>{selectedEmployee.fullName}</strong></div>
              <div><span>Matricule</span><strong>{selectedEmployee.localMatricule || selectedEmployee.biotimeCode || selectedEmployee.employeeCode}</strong></div>
              <div><span>Département</span><strong>{selectedEmployee.department || "-"}</strong></div>
            </div>
          )}
          {selectedEmployee && filters.leaveType === "ANNUEL" && balance.data && (
            <div className="attendance-summary-strip compact">
              <div><span>Droit annuel {balance.data.year}</span><strong>{formatDays(balance.data.daysEntitled)} j</strong></div>
              <div><span>Déjà pris</span><strong>{formatDays(balance.data.daysTaken)} j</strong></div>
              <div className={Number(balance.data.daysRemaining) < 0 ? "summary-warning" : ""}><span>Restant</span><strong>{formatDays(balance.data.daysRemaining)} j</strong></div>
            </div>
          )}
          {selectedEmployee && filters.leaveType === "ANNUEL" && balance.data && Number(balance.data.daysRemaining) < 0 && (
            <div className="alert alert-error">Solde annuel négatif: vérifiez report, ajustement ou autorisation spéciale.</div>
          )}
          <label className="filter-field">
            <span>Début congé</span>
            <input type="date" value={filters.dateStart} onChange={event => update({ dateStart: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Fin congé</span>
            <input type="date" value={filters.dateEnd} onChange={event => update({ dateEnd: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Note</span>
            <input value={filters.note} onChange={event => update({ note: event.target.value })} placeholder="Optionnel" />
          </label>
          <Button variant="primary" type="submit" disabled={saving || employees.loading}>
            {saving ? "Enregistrement..." : "Enregistrer congé"}
          </Button>
        </form>

        <div className="panel-header">
          <h2>Congés déclarés</h2>
          <span className="muted">{history.data.length} déclaration(s)</span>
        </div>
        <DataTable
          rows={history.data}
          loading={history.loading}
          loadingLabel="Chargement des congés déclarés..."
          empty="Aucun congé déclaré."
          pageSize={20}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayCode(row.employee)}</span></div>, sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "type", header: "Type", render: row => leaveTypeLabels[row.leaveType] || row.leaveType, sortValue: row => row.leaveType },
            { key: "reason", header: "Motif", render: row => row.exceptionalReason ? exceptionalReasonLabels[row.exceptionalReason] : "-", sortValue: row => row.exceptionalReason || "" },
            { key: "start", header: "Début", render: row => formatDate(row.dateStart), sortValue: row => row.dateStart },
            { key: "end", header: "Fin", render: row => formatDate(row.dateEnd), sortValue: row => row.dateEnd },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} />, sortValue: row => row.status },
            { key: "note", header: "Note", render: row => row.note || "-", sortValue: row => row.note || "" },
            { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-", sortValue: row => row.declaredBy?.fullName || row.declaredBy?.username || "" },
            { key: "approved", header: "Validé par", render: row => row.approvedBy?.fullName || row.approvedBy?.username || "-", sortValue: row => row.approvedBy?.fullName || row.approvedBy?.username || "" },
            { key: "created", header: "Créé le", render: row => new Date(row.createdAt).toLocaleString("fr-FR"), sortValue: row => row.createdAt },
            ...(isAdmin ? [{
              key: "actions",
              header: "Actions",
              render: (row: LeaveDeclaration) => <Button variant="danger" onClick={() => deleteLeave(row)}><Trash2 size={15} /> Supprimer</Button>
            }] : [])
          ]}
        />
      </section>
    </>
  );
}

const leaveTypeLabels: Record<LeaveType, string> = {
  ANNUEL: "Annuel",
  EXCEPTIONNEL: "Exceptionnel payé",
  SANS_SOLDE: "Sans solde",
  MATERNITE: "Maternité"
};

const exceptionalReasonLabels: Record<ExceptionalLeaveReason, string> = {
  MARIAGE_EMPLOYE: "Mariage de l'employé",
  NAISSANCE_ENFANT: "Naissance d'un enfant",
  MARIAGE_ENFANT: "Mariage d'un descendant",
  DECES_CONJOINT: "Décès du conjoint",
  DECES_PARENT_PROCHE: "Décès parent proche",
  CIRCONCISION_FILS: "Circoncision du fils",
  HAJJ: "Pèlerinage Hajj"
};

function displayCode(employee: { localMatricule?: string | null; biotimeCode?: string | null; employeeCode?: string | null }) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode || "-";
}

function formatDays(value: string | number) {
  const numberValue = Number(value);
  return Number.isInteger(numberValue) ? String(numberValue) : numberValue.toFixed(2);
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
