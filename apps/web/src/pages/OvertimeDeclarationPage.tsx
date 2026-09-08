import { Clock, Search, Trash2 } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Employee, OvertimeDeclaration, OvertimeEmployeeTotal, OvertimeRateType } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function OvertimeDeclarationPage() {
  const { user } = useAuth();
  const employees = useApi<Employee[]>("/api/employees", []);
  const { filters, update, reset } = useSessionFilters("overtime.declaration.filters", {
    search: "",
    employeeId: "",
    date: dateKey(new Date()),
    hours: "2",
    rateType: "RATE_50",
    reason: ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const historyPath = filters.employeeId
    ? `/api/attendance/declarations/overtime?employeeId=${encodeURIComponent(filters.employeeId)}`
    : "/api/attendance/declarations/overtime";
  const history = useApi<OvertimeDeclaration[]>(historyPath, []);
  const employeeTotals = useApi<OvertimeEmployeeTotal[]>("/api/attendance/declarations/overtime/by-employee", []);

  const filteredEmployees = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return employees.data;
    return employees.data.filter(employee => {
      const code = employee.localMatricule || employee.biotimeCode || employee.employeeCode || "";
      return `${employee.fullName} ${code} ${employee.department || ""}`.toLowerCase().includes(search);
    });
  }, [employees.data, filters.search]);

  const selectedEmployee = employees.data.find(employee => employee.id === filters.employeeId) || null;
  const visibleEmployeeTotals = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    return employeeTotals.data.filter(row => {
      if (filters.employeeId && row.employee.id !== filters.employeeId) return false;
      if (!search) return true;
      return `${row.employee.fullName} ${displayCode(row.employee)} ${row.employee.department || ""}`.toLowerCase().includes(search);
    });
  }, [employeeTotals.data, filters.employeeId, filters.search]);
  const isAdmin = Boolean(user?.roles.includes("ADMIN"));

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);

    if (!filters.employeeId) {
      setError("Choisissez un employé avant d'enregistrer.");
      return;
    }

    setSaving(true);
    try {
      const result = await api<{ status: string }>("/api/attendance/declarations/overtime", {
        method: "POST",
        body: JSON.stringify({
          employeeId: filters.employeeId,
          date: filters.date,
          hours: Number(filters.hours),
          rateType: filters.rateType,
          reason: filters.reason
        })
      });
      setMessage(result.status === "PENDING_APPROVAL"
        ? "Heures supplémentaires envoyées en attente de validation DRH/Admin."
        : "Heures supplémentaires enregistrées et approuvées.");
      update({ reason: "" });
      history.reload();
      employeeTotals.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Déclaration impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOvertime(row: OvertimeDeclaration) {
    setMessage(null);
    setError(null);
    const label = `${row.employee.fullName} - ${formatDate(row.date)} - ${Number(row.hours)} h`;
    if (!window.confirm(`Supprimer cette déclaration heures supplémentaires ?\n${label}`)) return;

    try {
      await api(`/api/attendance/declarations/overtime/${row.id}`, { method: "DELETE" });
      setMessage("Déclaration heures supplémentaires supprimée. Régénérez la synthèse paie si elle était déjà calculée.");
      history.reload();
      employeeTotals.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.");
    }
  }

  return (
    <>
      <PageHeader title="Déclarer heures supplémentaires" />
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
          <strong><Clock size={16} /> Déclaration</strong>
          {selectedEmployee && (
            <div className="detail-grid compact">
              <div><span>Employé</span><strong>{selectedEmployee.fullName}</strong></div>
              <div><span>Matricule</span><strong>{selectedEmployee.localMatricule || selectedEmployee.biotimeCode || selectedEmployee.employeeCode}</strong></div>
              <div><span>Département</span><strong>{selectedEmployee.department || "-"}</strong></div>
            </div>
          )}
          <label className="filter-field">
            <span>Jour</span>
            <input type="date" value={filters.date} onChange={event => update({ date: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Heures supplémentaires</span>
            <input type="number" min="0.25" max="24" step="0.25" value={filters.hours} onChange={event => update({ hours: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Type</span>
            <select value={filters.rateType} onChange={event => update({ rateType: event.target.value as OvertimeRateType })}>
              {overtimeRateOptions.map(option => (
                <option key={option.value} value={option.value} title={option.hint}>{option.label}</option>
              ))}
            </select>
            <small className="muted">{overtimeRateOptions.find(option => option.value === filters.rateType)?.hint}</small>
          </label>
          <label className="filter-field">
            <span>Motif</span>
            <input value={filters.reason} onChange={event => update({ reason: event.target.value })} placeholder="Ex: besoin production, inventaire..." />
          </label>
          <Button variant="primary" type="submit" disabled={saving || employees.loading}>
            {saving ? "Envoi..." : "Déclarer"}
          </Button>
        </form>

        <div className="panel-header">
          <div>
            <h2>Heures supplémentaires de mes employés</h2>
            <span className="muted">Tous les employés de votre périmètre, y compris ceux sans déclaration</span>
          </div>
          <span className="muted">{visibleEmployeeTotals.length} employé(s)</span>
        </div>
        <DataTable
          rows={visibleEmployeeTotals}
          loading={employeeTotals.loading}
          loadingLabel="Chargement des employés et des heures supplémentaires..."
          empty="Aucun employé dans votre périmètre."
          pageSize={40}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayCode(row.employee)}</span></div>, sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "count", header: "Déclarations", render: row => row.declarationCount, sortValue: row => row.declarationCount },
            { key: "pending", header: "En attente", render: row => row.pendingCount ? <span className="badge badge-orange">{row.pendingCount}</span> : "0", sortValue: row => row.pendingCount },
            { key: "rate50", header: "Sup. 50%", render: row => `${row.rate50} h`, sortValue: row => row.rate50 },
            { key: "rate75", header: "Sup. 75%", render: row => `${row.rate75} h`, sortValue: row => row.rate75 },
            { key: "rate100", header: "Sup. 100%", render: row => `${row.rate100} h`, sortValue: row => row.rate100 },
            { key: "total", header: "Total heures", render: row => <strong>{row.total} h</strong>, sortValue: row => row.total },
            { key: "action", header: "Action", render: row => <Button variant="secondary" onClick={() => update({ employeeId: row.employee.id, search: "" })}>Voir le détail</Button> }
          ]}
        />

        <div className="panel-header">
          <h2>Heures supplémentaires déclarées</h2>
          <span className="muted">{history.data.length} déclaration(s)</span>
        </div>
        <DataTable
          rows={history.data}
          loading={history.loading}
          loadingLabel="Chargement des heures supplémentaires..."
          empty="Aucune heure supplémentaire déclarée."
          pageSize={20}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayCode(row.employee)}</span></div>, sortValue: row => row.employee.fullName },
            { key: "date", header: "Jour", render: row => formatDate(row.date), sortValue: row => row.date },
            { key: "hours", header: "Heures", render: row => `${Number(row.hours)} h`, sortValue: row => Number(row.hours) },
            { key: "rate", header: "Type", render: row => `${Number(row.ratePercent ?? overtimeRatePercent(row.rateType))}%`, sortValue: row => Number(row.ratePercent ?? overtimeRatePercent(row.rateType)) },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} />, sortValue: row => row.status },
            { key: "reason", header: "Motif", render: row => row.reason || "-", sortValue: row => row.reason || "" },
            { key: "declaredBy", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-", sortValue: row => row.declaredBy?.fullName || row.declaredBy?.username || "" },
            { key: "approvedBy", header: "Validé par", render: row => row.approvedBy?.fullName || row.approvedBy?.username || "-", sortValue: row => row.approvedBy?.fullName || row.approvedBy?.username || "" },
            { key: "created", header: "Créé le", render: row => new Date(row.createdAt).toLocaleString("fr-FR"), sortValue: row => row.createdAt },
            ...(isAdmin ? [{
              key: "actions",
              header: "Actions",
              render: (row: OvertimeDeclaration) => <Button variant="danger" onClick={() => deleteOvertime(row)}><Trash2 size={15} /> Supprimer</Button>
            }] : [])
          ]}
        />
      </section>
    </>
  );
}

const overtimeRateOptions: Array<{ value: OvertimeRateType; label: string; hint: string }> = [
  { value: "RATE_50", label: "50%", hint: "50% : heures sup. de jour en semaine" },
  { value: "RATE_75", label: "75%", hint: "75% : heures sup. de nuit ou dimanche" },
  { value: "RATE_100", label: "100%", hint: "100% : jour férié" }
];

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function displayCode(employee: { localMatricule?: string | null; biotimeCode?: string | null; employeeCode?: string | null }) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode || "-";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR");
}

function overtimeRatePercent(value: string) {
  if (value === "RATE_75") return 75;
  if (value === "RATE_100") return 100;
  return 50;
}
