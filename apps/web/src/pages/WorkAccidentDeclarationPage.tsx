import { AlertTriangle, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { Employee, WorkAccidentDeclaration } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function WorkAccidentDeclarationPage() {
  const employees = useApi<Employee[]>("/api/employees", []);
  const { filters, update, reset } = useSessionFilters("work-accident.declaration.filters", {
    search: "",
    employeeId: "",
    dateStart: dateKey(new Date()),
    dateEnd: dateKey(new Date()),
    note: ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const historyPath = filters.employeeId
    ? `/api/attendance/declarations/work-accidents?employeeId=${encodeURIComponent(filters.employeeId)}`
    : "/api/attendance/declarations/work-accidents";
  const history = useApi<WorkAccidentDeclaration[]>(historyPath, []);

  const filteredEmployees = useMemo(() => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return employees.data;
    return employees.data.filter(employee => {
      const code = employee.localMatricule || employee.biotimeCode || employee.employeeCode || "";
      return `${employee.fullName} ${code} ${employee.department || ""}`.toLowerCase().includes(search);
    });
  }, [employees.data, filters.search]);

  const selectedEmployee = employees.data.find(employee => employee.id === filters.employeeId) || null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    setMessage(null);
    setError(null);
    if (!filters.employeeId) return setError("Choisissez un employé avant d'enregistrer.");
    if (filters.dateEnd < filters.dateStart) return setError("La date de fin doit être après la date de début.");
    setSaving(true);
    try {
      await api("/api/attendance/declarations/work-accidents", {
        method: "POST",
        body: JSON.stringify({
          employeeId: filters.employeeId,
          dateStart: filters.dateStart,
          dateEnd: filters.dateEnd,
          note: filters.note
        })
      });
      setMessage("Accident de travail enregistré. Il apparaîtra dans la synthèse après régénération de la période.");
      update({ note: "" });
      history.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Déclaration impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <PageHeader title="Déclarer accident de travail" />
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
                <option key={employee.id} value={employee.id}>{displayCode(employee)} - {employee.fullName}</option>
              ))}
            </select>
          </FilterField>
        </FiltersBar>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <form className="quick-create declaration-card" onSubmit={submit}>
          <strong><AlertTriangle size={16} /> Déclaration accident de travail</strong>
          {selectedEmployee && (
            <div className="detail-grid compact">
              <div><span>Employé</span><strong>{selectedEmployee.fullName}</strong></div>
              <div><span>Matricule</span><strong>{displayCode(selectedEmployee)}</strong></div>
              <div><span>Département</span><strong>{selectedEmployee.department || "-"}</strong></div>
            </div>
          )}
          <label className="filter-field">
            <span>Début accident</span>
            <input type="date" value={filters.dateStart} onChange={event => update({ dateStart: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Fin accident</span>
            <input type="date" value={filters.dateEnd} onChange={event => update({ dateEnd: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Note</span>
            <input value={filters.note} onChange={event => update({ note: event.target.value })} placeholder="Optionnel" />
          </label>
          <Button variant="primary" type="submit" disabled={saving || employees.loading}>
            {saving ? "Enregistrement..." : "Enregistrer accident"}
          </Button>
        </form>

        <div className="panel-header">
          <h2>Accidents déclarés</h2>
          <span className="muted">{history.data.length} déclaration(s)</span>
        </div>
        <DataTable
          rows={history.data}
          loading={history.loading}
          loadingLabel="Chargement des accidents déclarés..."
          empty="Aucun accident déclaré."
          pageSize={20}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayCode(row.employee)}</span></div>, sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "start", header: "Début", render: row => formatDate(row.dateStart), sortValue: row => row.dateStart },
            { key: "end", header: "Fin", render: row => formatDate(row.dateEnd), sortValue: row => row.dateEnd },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} />, sortValue: row => row.status },
            { key: "note", header: "Note", render: row => row.note || "-", sortValue: row => row.note || "" },
            { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-", sortValue: row => row.declaredBy?.fullName || row.declaredBy?.username || "" },
            { key: "created", header: "Créé le", render: row => new Date(row.createdAt).toLocaleString("fr-FR"), sortValue: row => row.createdAt }
          ]}
        />
      </section>
    </>
  );
}

function displayCode(employee: { localMatricule?: string | null; biotimeCode?: string | null; employeeCode?: string | null }) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode || "-";
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("fr-FR");
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
