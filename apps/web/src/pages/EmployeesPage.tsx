import { Eye, Search } from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PermissionGate } from "../lib/auth";
import { Employee } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

function displayMatricule(employee: Employee) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode;
}

function displayPhone(employee: Employee) {
  return employee.sapPhone || employee.displayPhone || employee.phone || "-";
}

export function EmployeesPage() {
  const { filters, update, reset } = useSessionFilters("employees.filters", { q: "", department: "", status: "" });
  const employees = useApi<Employee[]>("/api/employees", []);
  const rows = employees.data.filter(employee => {
    const q = filters.q.toLowerCase();
    return (!q || `${displayMatricule(employee)} ${employee.employeeCode} ${employee.biotimeCode || ""} ${employee.fullName}`.toLowerCase().includes(q))
      && (!filters.department || employee.department?.toLowerCase().includes(filters.department.toLowerCase()))
      && (!filters.status || employee.status === filters.status);
  });

  return (
    <>
      <PageHeader title="Employés" actions={<PermissionGate permission="employees.manage"><Button variant="primary">Nouvel employé</Button></PermissionGate>} />
      <section className="panel">
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.q} onChange={e => update({ q: e.target.value })} placeholder="Code ou nom" /></div>
          </FilterField>
          <FilterField label="Département">
            <input value={filters.department} onChange={e => update({ department: e.target.value })} placeholder="Production, RH..." />
          </FilterField>
          <FilterField label="Statut">
            <select value={filters.status} onChange={e => update({ status: e.target.value })}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actifs</option>
              <option value="RESIGNED">Démissionnés</option>
            </select>
          </FilterField>
        </FiltersBar>
        {employees.error && <div className="alert">Endpoint employés pas encore branché côté API. La page est prête pour `/api/employees`.</div>}
        <DataTable
          rows={rows}
          loading={employees.loading}
          loadingLabel="Chargement des employés..."
          empty="Aucun employé trouvé."
          columns={[
            { key: "matricule", header: "Matricule affiché", render: row => displayMatricule(row), sortValue: row => displayMatricule(row) },
            { key: "source", header: "Code BioTime", render: row => row.biotimeCode || row.employeeCode, sortValue: row => row.biotimeCode || row.employeeCode },
            { key: "name", header: "Nom", render: row => row.fullName, sortValue: row => row.fullName },
            { key: "department", header: "Département", render: row => row.department || "-", sortValue: row => row.department || "" },
            { key: "phone", header: "Téléphone SAP", render: row => displayPhone(row), sortValue: row => displayPhone(row) },
            { key: "hire", header: "Embauche", render: row => row.hireDate ? new Date(row.hireDate).toLocaleDateString("fr-FR") : "-" },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
            { key: "actions", header: "Actions", render: row => <Link className="icon-button" to={`/employees/${row.id}`} title="Voir fiche"><Eye size={16} /></Link> }
          ]}
        />
      </section>
    </>
  );
}
