import { Clock3, Edit, Eye, Plus, Search, UserX } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { BiometricBadges } from "../components/BiometricBadges";
import { DataTable } from "../components/DataTable";
import { EmployeePunchHistoryModal } from "../components/EmployeePunchHistoryModal";
import { EmployeeResignModal } from "../components/EmployeeResignModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PermissionGate, useAuth } from "../lib/auth";
import { Employee } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

function displayMatricule(employee: Employee) {
  return employee.localMatricule || employee.biotimeCode || employee.employeeCode;
}

function displayPhone(employee: Employee) {
  return employee.sapPhone || employee.displayPhone || employee.phone || "-";
}

function displayDate(value?: string | null) {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

export function EmployeesPage() {
  const { user } = useAuth();
  const { filters, update, reset } = useSessionFilters("employees.filters", { q: "", department: "", status: "" });
  const [historyEmployee, setHistoryEmployee] = useState<Employee | null>(null);
  const [resignEmployee, setResignEmployee] = useState<Employee | null>(null);
  const employees = useApi<Employee[]>("/api/employees", []);
  const canManageResigns = Boolean(user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)));
  const rows = employees.data.filter(employee => {
    const q = filters.q.toLowerCase();
    return (!q || `${displayMatricule(employee)} ${employee.employeeCode} ${employee.biotimeCode || ""} ${employee.fullName}`.toLowerCase().includes(q))
      && (!filters.department || employee.department?.toLowerCase().includes(filters.department.toLowerCase()))
      && (!filters.status || employee.status === filters.status);
  });

  return (
    <>
      <PageHeader title="Employés" actions={<PermissionGate permission="employees.manage"><Link className="btn btn-primary" to="/employees/new"><Plus size={15} /> Nouvel employé</Link></PermissionGate>} />
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
            { key: "biometric", header: "Biométrie", render: row => <BiometricBadges enrollment={row.biometricEnrollment} compact /> },
            { key: "hire", header: "Embauche", render: row => displayDate(row.hireDate), sortValue: row => row.hireDate || "" },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
            { key: "actions", header: "Actions", render: row => (
              <div className="row-actions">
                <Link className="icon-button" to={`/employees/${row.id}`} title="Voir fiche"><Eye size={16} /></Link>
                <button className="icon-button" type="button" onClick={() => setHistoryEmployee(row)} title="Historique des pointages"><Clock3 size={16} /></button>
                {canManageResigns && row.status === "ACTIVE" && <button className="icon-button" type="button" onClick={() => setResignEmployee(row)} title="Démissionner"><UserX size={16} /></button>}
                <PermissionGate permission="employees.manage"><Link className="icon-button" to={`/employees/${row.id}/edit`} title="Modifier BioTime"><Edit size={16} /></Link></PermissionGate>
              </div>
            ) }
          ]}
        />
      </section>
      <EmployeePunchHistoryModal employee={historyEmployee} onClose={() => setHistoryEmployee(null)} />
      <EmployeeResignModal employee={resignEmployee} onClose={() => setResignEmployee(null)} onDone={employees.reload} />
    </>
  );
}
