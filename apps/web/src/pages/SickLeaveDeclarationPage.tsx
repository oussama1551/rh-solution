import { CalendarPlus, Pencil, Search, Trash2, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Employee, SickLeaveDeclaration } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function SickLeaveDeclarationPage() {
  const { user } = useAuth();
  const employees = useApi<Employee[]>("/api/employees", []);
  const { filters, update, reset } = useSessionFilters("sick-leave.declaration.filters", {
    search: "",
    employeeId: "",
    dateStart: dateKey(new Date()),
    dateEnd: dateKey(new Date()),
    note: ""
  });
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const historyPath = filters.employeeId
    ? `/api/attendance/declarations/sick-leaves?employeeId=${encodeURIComponent(filters.employeeId)}`
    : "/api/attendance/declarations/sick-leaves";
  const history = useApi<SickLeaveDeclaration[]>(historyPath, []);

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
      const result = await api<{ status: string }>(editingId ? `/api/attendance/declarations/sick-leaves/${editingId}` : "/api/attendance/declarations/sick-leaves", {
        method: editingId ? "PATCH" : "POST",
        body: JSON.stringify({
          ...(editingId ? {} : { employeeId: filters.employeeId }),
          dateStart: filters.dateStart,
          dateEnd: filters.dateEnd,
          note: filters.note
        })
      });
      setMessage("Maladie enregistrée. Elle apparaîtra dans la synthèse après régénération de la période.");
      setMessage(result.status === "PENDING_APPROVAL" ? "Maladie envoyée en validation Admin/DRH." : "Maladie enregistrée. Régénérez la synthèse paie pour actualiser les données.");
      setEditingId(null);
      update({ note: "" });
      history.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Déclaration maladie impossible.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteSickLeave(row: SickLeaveDeclaration) {
    setMessage(null);
    setError(null);
    const label = `${row.employee.fullName} - ${formatDate(row.dateStart)} au ${formatDate(row.dateEnd)}`;
    if (!window.confirm(`Supprimer cette déclaration maladie ?\n${label}`)) return;

    try {
      await api(`/api/attendance/declarations/sick-leaves/${row.id}`, { method: "DELETE" });
      setMessage("Déclaration maladie supprimée. Régénérez la synthèse paie si elle était déjà calculée.");
      history.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Suppression impossible.");
    }
  }

  function editSickLeave(row: SickLeaveDeclaration) {
    setEditingId(row.id);
    update({ employeeId: row.employee.id, dateStart: row.dateStart.slice(0, 10), dateEnd: row.dateEnd.slice(0, 10), note: row.note || "" });
    setMessage(null); setError(null); window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function cancelEdit() { setEditingId(null); update({ note: "" }); }

  return (
    <>
      <PageHeader title="Déclarer maladie" />
      <section className="panel">
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche employé">
            <div className="input-icon">
              <Search size={15} />
              <input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule, département..." />
            </div>
          </FilterField>
          <FilterField label="Employé">
            <select value={filters.employeeId} disabled={Boolean(editingId)} onChange={event => update({ employeeId: event.target.value })}>
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
          <strong><CalendarPlus size={16} /> Déclaration maladie</strong>
          {selectedEmployee && (
            <div className="detail-grid compact">
              <div><span>Employé</span><strong>{selectedEmployee.fullName}</strong></div>
              <div><span>Matricule</span><strong>{selectedEmployee.localMatricule || selectedEmployee.biotimeCode || selectedEmployee.employeeCode}</strong></div>
              <div><span>Département</span><strong>{selectedEmployee.department || "-"}</strong></div>
            </div>
          )}
          <label className="filter-field">
            <span>Début maladie</span>
            <input type="date" value={filters.dateStart} onChange={event => update({ dateStart: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Fin maladie</span>
            <input type="date" value={filters.dateEnd} onChange={event => update({ dateEnd: event.target.value })} />
          </label>
          <label className="filter-field">
            <span>Note</span>
            <input value={filters.note} onChange={event => update({ note: event.target.value })} placeholder="Optionnel" />
          </label>
          <Button variant="primary" type="submit" disabled={saving || employees.loading}>
            {saving ? "Enregistrement..." : editingId ? "Enregistrer les modifications" : "Enregistrer maladie"}
          </Button>
          {editingId && <Button variant="secondary" type="button" onClick={cancelEdit}><X size={15} /> Annuler</Button>}
        </form>

        <div className="panel-header">
          <h2>Maladies déclarées</h2>
          <span className="muted">{history.data.length} déclaration(s)</span>
        </div>
        <DataTable
          rows={history.data}
          loading={history.loading}
          loadingLabel="Chargement des maladies déclarées..."
          empty="Aucune maladie déclarée."
          pageSize={20}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayCode(row.employee)}</span></div>, sortValue: row => row.employee.fullName },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "start", header: "Début", render: row => formatDate(row.dateStart), sortValue: row => row.dateStart },
            { key: "end", header: "Fin", render: row => formatDate(row.dateEnd), sortValue: row => row.dateEnd },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} />, sortValue: row => row.status },
            { key: "note", header: "Note", render: row => row.note || "-", sortValue: row => row.note || "" },
            { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-", sortValue: row => row.declaredBy?.fullName || row.declaredBy?.username || "" },
            { key: "created", header: "Créé le", render: row => new Date(row.createdAt).toLocaleString("fr-FR"), sortValue: row => row.createdAt },
            ...((isAdmin || history.data.some(row => row.declaredBy?.id === user?.id)) ? [{
              key: "actions",
              header: "Actions",
              render: (row: SickLeaveDeclaration) => <div className="row-actions">
                {row.declaredBy?.id === user?.id && <Button variant="secondary" onClick={() => editSickLeave(row)}><Pencil size={15} /> Modifier</Button>}
                {isAdmin && <Button variant="danger" onClick={() => deleteSickLeave(row)}><Trash2 size={15} /> Supprimer</Button>}
              </div>
            }] : [])
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
