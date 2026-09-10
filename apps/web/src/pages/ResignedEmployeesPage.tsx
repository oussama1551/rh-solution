import { FileText, LoaderCircle, RefreshCw, RotateCcw, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { HrDecisionDraftModal } from "../components/HrDecisionDraftModal";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { ResignRecordRow, ResignationDecision, ResignationDecisionDraft, ResignationDecisionState } from "../lib/types";
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
  const canGenerateDecision = Boolean(user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)));
  const [decisionBusy,setDecisionBusy]=useState<string|null>(null);
  const [decisionProgress,setDecisionProgress]=useState<{label:string;value:number}|null>(null);
  const [decisionDraft,setDecisionDraft]=useState<{row:ResignRecordRow;regenerate:boolean;data:ResignationDecisionDraft}|null>(null);

  async function decision(row: ResignRecordRow, regenerate=false) {
    const employeeId=row.employee?.id; if(!employeeId)return setError("Employé local non lié : génération impossible."); setDecisionBusy(row.id);setDecisionProgress({label:"Vérification du dossier...",value:20});setError(null);
    try { await api<ResignationDecisionState>(`/api/resignation-decisions/employee/${employeeId}`);
      if(regenerate&&!window.confirm("Régénérer attribuera un nouveau numéro définitif. Continuer ?"))return;
      setDecisionProgress({label:"Préparation des données...",value:40}); const data=await api<ResignationDecisionDraft>(`/api/resignation-decisions/employee/${employeeId}/preview`);
      setDecisionDraft({row,regenerate,data}); setDecisionProgress(null);
    } catch(err){setError(readableError(err,"Génération impossible."));} finally{setDecisionBusy(null); if(!decisionDraft)window.setTimeout(()=>setDecisionProgress(null),700);}
  }
  async function generateFromDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!decisionDraft)return; const employeeId=decisionDraft.row.employee?.id; if(!employeeId)return;
    const form = new FormData(event.currentTarget); const decisionDate = String(form.get("decisionDate") || ""); const decisionType = String(form.get("decisionType") || "RESIGNATION"); const overrides = Object.fromEntries(["employeeName","employeePosition","employeeNumber","hireDate","newPosition","grade","category","contractDate","requestDate","effectiveDate","gerantName"].map(key => [key, String(form.get(key) || "")]));
    setDecisionBusy(decisionDraft.row.id); setDecisionProgress({label:"Génération du document arabe...",value:45}); setError(null);
    try {
      const generated=await api<ResignationDecision>(`/api/resignation-decisions/employee/${employeeId}/generate`,{method:"POST",body:JSON.stringify({decisionType,decisionDate,regenerate:decisionDraft.regenerate,overrides})});
      setDecisionProgress({label:"Préparation du téléchargement...",value:75}); await download(generated); setDecisionDraft(null); await rows.reload();
    } catch(err){setError(readableError(err,"Génération impossible."));} finally{setDecisionBusy(null);window.setTimeout(()=>setDecisionProgress(null),700);}
  }
  async function download(value:ResignationDecision){
    const payload=await api<{fileName:string;contentBase64:string}>(`/api/resignation-decisions/${value.id}/download-data`);
    const binary=window.atob(payload.contentBase64);const bytes=new Uint8Array(binary.length);for(let i=0;i<binary.length;i+=1)bytes[i]=binary.charCodeAt(i);
    const blob=new Blob([bytes],{type:"application/pdf"}); const url=URL.createObjectURL(blob); const link=document.createElement("a");
    link.href=url;link.download=payload.fileName;document.body.appendChild(link);link.click();link.remove();setDecisionProgress({label:"PDF téléchargé",value:100});setMessage(`Document ${value.decisionNumber} téléchargé.`);
    window.setTimeout(()=>URL.revokeObjectURL(url),30_000);
  }

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
        {decisionProgress&&<div className="decision-progress" role="status"><div><LoaderCircle className="spin" size={16}/><strong>{decisionProgress.label}</strong><span>{decisionProgress.value}%</span></div><div className="decision-progress-track"><i style={{width:`${decisionProgress.value}%`}}/></div></div>}
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
              <div className="table-actions">{canGenerateDecision&&<><Button onClick={()=>decision(row)} disabled={decisionBusy===row.id}><FileText size={15}/> Décision PDF</Button><Button variant="secondary" title="Créer une nouvelle décision avec un nouveau numéro" onClick={()=>decision(row,true)} disabled={decisionBusy===row.id}><RefreshCw size={14}/> Régénérer</Button></>}{canManageResigns ? (
                <Button variant="secondary" onClick={() => restore(row)} disabled={restoringId === row.id}>
                  <RotateCcw size={15} /> {restoringId === row.id ? "Restauration..." : "Restaurer"}
                </Button>
              ) : !canGenerateDecision&&"-"}</div>
            ) }
          ]}
        />
      </section>
      {decisionDraft&&<HrDecisionDraftModal draft={decisionDraft.data} busy={decisionBusy===decisionDraft.row.id} regenerate={decisionDraft.regenerate} onClose={()=>setDecisionDraft(null)} onSubmit={generateFromDraft} onDownload={download}/>}
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
