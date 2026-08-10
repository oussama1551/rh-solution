import { RotateCcw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ResignRecordRow } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function ResignedEmployeesPage() {
  const { user } = useAuth();
  const { filters, update, reset } = useSessionFilters("resigned-employees.filters", {
    q: "",
    department: "",
    resignType: "",
    from: "",
    to: ""
  });
  const params = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)), [filters]);
  const rows = useApi<ResignRecordRow[]>(`/api/employees/resigned?${params.toString()}`, []);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canManageResigns = Boolean(user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)));

  async function restore(row: ResignRecordRow) {
    if (!window.confirm(`Restaurer ${row.employeeName || row.employeeZktecoId || "cet employé"} dans BioTime ?`)) return;
    setRestoringId(row.id);
    setMessage(null);
    setError(null);
    try {
      await api(`/api/employees/resigns/${row.id}/reinstate`, { method: "POST" });
      setMessage("Employé restauré dans BioTime et RH Solution.");
      await rows.reload();
    } catch (err) {
      setError(readableError(err, "Restauration impossible."));
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <>
      <PageHeader title="Démissionnés" />
      <section className="panel">
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.q} onChange={event => update({ q: event.target.value })} placeholder="Nom ou matricule..." /></div>
          </FilterField>
          <FilterField label="Département">
            <input value={filters.department} onChange={event => update({ department: event.target.value })} placeholder="Production, RH..." />
          </FilterField>
          <FilterField label="Type">
            <input value={filters.resignType} onChange={event => update({ resignType: event.target.value })} placeholder="Fin de contrat..." />
          </FilterField>
          <FilterField label="Du">
            <input type="date" value={filters.from} onChange={event => update({ from: event.target.value })} />
          </FilterField>
          <FilterField label="Au">
            <input type="date" value={filters.to} onChange={event => update({ to: event.target.value })} />
          </FilterField>
        </FiltersBar>

        <DataTable
          rows={rows.data}
          loading={rows.loading}
          loadingLabel="Chargement des démissionnés..."
          empty="Aucune démission trouvée."
          columns={[
            { key: "code", header: "Matricule", render: row => displayMatricule(row), sortValue: row => displayMatricule(row) },
            { key: "name", header: "Nom", render: row => row.employeeName || "-", sortValue: row => row.employeeName || "" },
            { key: "department", header: "Département", render: row => row.department || "-", sortValue: row => row.department || "" },
            { key: "type", header: "Type de démission", render: row => row.resignType || "-", sortValue: row => row.resignType || "" },
            { key: "date", header: "Date de démission", render: row => displayDate(row.resignDate), sortValue: row => row.resignDate || "" },
            { key: "reason", header: "Raison", render: row => row.reason || "-", sortValue: row => row.reason || "" },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
            { key: "actions", header: "Actions", render: row => (
              canManageResigns ? (
                <Button variant="secondary" onClick={() => restore(row)} disabled={restoringId === row.id}>
                  <RotateCcw size={15} /> {restoringId === row.id ? "Restauration..." : "Restaurer"}
                </Button>
              ) : "-"
            ) }
          ]}
        />
      </section>
    </>
  );
}

function displayMatricule(row: ResignRecordRow) {
  return row.employeeCode || row.employeeZktecoId || "-";
}

function displayDate(value?: string | null) {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
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
