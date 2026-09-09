import { ClipboardCheck, Clock3, Edit, Eye, FileText, LoaderCircle, Plus, Search, UserX } from "lucide-react";
import { FormEvent, useState } from "react";
import { Link } from "react-router-dom";
import { BiometricBadges } from "../components/BiometricBadges";
import { DataTable } from "../components/DataTable";
import { EmployeePunchHistoryModal } from "../components/EmployeePunchHistoryModal";
import { EmployeeResignModal } from "../components/EmployeeResignModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { HrDecisionDraftModal } from "../components/HrDecisionDraftModal";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { PermissionGate, useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { Employee, ResignationDecision, ResignationDecisionDraft } from "../lib/types";
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
  const [decisionDraft, setDecisionDraft] = useState<{ row: Employee; regenerate: boolean; data: ResignationDecisionDraft } | null>(null);
  const [decisionBusy, setDecisionBusy] = useState<string | null>(null);
  const [decisionProgress, setDecisionProgress] = useState<{ label: string; value: number } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const employees = useApi<Employee[]>("/api/employees", []);
  const canManageResigns = Boolean(user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)));
  const canGenerateDecision = Boolean(user?.roles.some(role => ["ADMIN", "DRH"].includes(role)));
  const rows = employees.data.filter(employee => {
    const q = filters.q.toLowerCase();
    return (!q || `${displayMatricule(employee)} ${employee.employeeCode} ${employee.biotimeCode || ""} ${employee.fullName}`.toLowerCase().includes(q))
      && (!filters.department || employee.department?.toLowerCase().includes(filters.department.toLowerCase()))
      && (!filters.status || employee.status === filters.status);
  });

  async function positionDecision(row: Employee) {
    setDecisionBusy(row.id); setDecisionProgress({ label: "Préparation des données...", value: 40 }); setError(null);
    try {
      const data = await api<ResignationDecisionDraft>(`/api/resignation-decisions/employee/${row.id}/preview?type=POSITION_CHANGE`);
      setDecisionDraft({ row, regenerate: true, data }); setDecisionProgress(null);
    } catch (err) {
      setError(readableError(err, "Génération impossible."));
    } finally {
      setDecisionBusy(null); window.setTimeout(() => setDecisionProgress(null), 700);
    }
  }

  async function generateFromDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!decisionDraft) return;
    const form = new FormData(event.currentTarget);
    const decisionDate = String(form.get("decisionDate") || "");
    const decisionType = String(form.get("decisionType") || "POSITION_CHANGE");
    const overrides = Object.fromEntries(["employeeName","employeePosition","employeeNumber","hireDate","newPosition","grade","category","contractDate","requestDate","effectiveDate","gerantName"].map(key => [key, String(form.get(key) || "")]));
    setDecisionBusy(decisionDraft.row.id); setDecisionProgress({ label: "Génération du document arabe...", value: 45 }); setError(null);
    try {
      const generated = await api<ResignationDecision>(`/api/resignation-decisions/employee/${decisionDraft.row.id}/generate`, { method: "POST", body: JSON.stringify({ decisionType, decisionDate, regenerate: decisionDraft.regenerate, overrides }) });
      setDecisionProgress({ label: "Préparation du téléchargement...", value: 75 }); await download(generated); setDecisionDraft(null);
    } catch (err) {
      setError(readableError(err, "Génération impossible."));
    } finally {
      setDecisionBusy(null); window.setTimeout(() => setDecisionProgress(null), 700);
    }
  }

  async function download(value: ResignationDecision) {
    const payload = await api<{ fileName: string; contentBase64: string }>(`/api/resignation-decisions/${value.id}/download-data`);
    const binary = window.atob(payload.contentBase64); const bytes = new Uint8Array(binary.length); for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    const blob = new Blob([bytes], { type: "application/pdf" }); const url = URL.createObjectURL(blob); const link = document.createElement("a");
    link.href = url; link.download = payload.fileName; document.body.appendChild(link); link.click(); link.remove(); setDecisionProgress({ label: "PDF téléchargé", value: 100 }); setMessage(`Document ${value.decisionNumber} téléchargé.`);
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  return (
    <>
      <PageHeader title="Employés" actions={<PermissionGate permission="employees.manage"><div className="row-actions"><Link className="btn btn-secondary" to="/employee-contracts"><ClipboardCheck size={15} /> Contrats</Link><Link className="btn btn-primary" to="/employees/new"><Plus size={15} /> Nouvel employé + contrat</Link></div></PermissionGate>} />
      <section className="panel">
        {decisionProgress&&<div className="decision-progress" role="status"><div><LoaderCircle className="spin" size={16}/><strong>{decisionProgress.label}</strong><span>{decisionProgress.value}%</span></div><div className="decision-progress-track"><i style={{width:`${decisionProgress.value}%`}}/></div></div>}
        {message&&<div className="alert alert-success">{message}</div>}
        {error&&<div className="alert alert-error">{error}</div>}
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
                {canGenerateDecision && row.status === "ACTIVE" && <button className="icon-button" type="button" onClick={() => positionDecision(row)} disabled={decisionBusy === row.id} title="Décision changement de poste"><FileText size={16} /></button>}
                {canManageResigns && row.status === "ACTIVE" && <button className="icon-button" type="button" onClick={() => setResignEmployee(row)} title="Démissionner"><UserX size={16} /></button>}
                <PermissionGate permission="employees.manage"><Link className="icon-button" to={`/employees/${row.id}/edit`} title="Modifier BioTime"><Edit size={16} /></Link></PermissionGate>
              </div>
            ) }
          ]}
        />
      </section>
      <EmployeePunchHistoryModal employee={historyEmployee} onClose={() => setHistoryEmployee(null)} />
      <EmployeeResignModal employee={resignEmployee} onClose={() => setResignEmployee(null)} onDone={employees.reload} />
      {decisionDraft&&<HrDecisionDraftModal draft={decisionDraft.data} busy={decisionBusy===decisionDraft.row.id} regenerate={decisionDraft.regenerate} onClose={()=>setDecisionDraft(null)} onSubmit={generateFromDraft} onDownload={download}/>}
    </>
  );
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
