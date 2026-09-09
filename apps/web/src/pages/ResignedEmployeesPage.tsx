import { FileText, LoaderCircle, RefreshCw, RotateCcw, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
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
  const canGenerateDecision = Boolean(user?.roles.some(role => ["ADMIN", "DRH"].includes(role)));
  const [decisionBusy,setDecisionBusy]=useState<string|null>(null);
  const [decisionProgress,setDecisionProgress]=useState<{label:string;value:number}|null>(null);
  const [decisionDraft,setDecisionDraft]=useState<{row:ResignRecordRow;regenerate:boolean;data:ResignationDecisionDraft}|null>(null);

  async function decision(row: ResignRecordRow, regenerate=false) {
    const employeeId=row.employee?.id; if(!employeeId)return setError("Employé local non lié : génération impossible."); setDecisionBusy(row.id);setDecisionProgress({label:"Vérification du dossier...",value:20});setError(null);
    try { const state=await api<ResignationDecisionState>(`/api/resignation-decisions/employee/${employeeId}`); if(state.latest&&!regenerate){setDecisionProgress({label:"Préparation du téléchargement...",value:70});await download(state.latest);return;}
      if(regenerate&&!window.confirm("Régénérer attribuera un nouveau numéro définitif. Continuer ?"))return;
      setDecisionProgress({label:"Préparation des données...",value:40}); const data=await api<ResignationDecisionDraft>(`/api/resignation-decisions/employee/${employeeId}/preview`);
      setDecisionDraft({row,regenerate,data}); setDecisionProgress(null);
    } catch(err){setError(readableError(err,"Génération impossible."));} finally{setDecisionBusy(null); if(!decisionDraft)window.setTimeout(()=>setDecisionProgress(null),700);}
  }
  async function generateFromDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if(!decisionDraft)return; const employeeId=decisionDraft.row.employee?.id; if(!employeeId)return;
    const form = new FormData(event.currentTarget); const overrides = Object.fromEntries(["employeeName","employeePosition","contractDate","requestDate","effectiveDate","gerantName"].map(key => [key, String(form.get(key) || "")]));
    setDecisionBusy(decisionDraft.row.id); setDecisionProgress({label:"Génération du document arabe...",value:45}); setError(null);
    try {
      const generated=await api<ResignationDecision>(`/api/resignation-decisions/employee/${employeeId}/generate`,{method:"POST",body:JSON.stringify({regenerate:decisionDraft.regenerate,overrides})});
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
      {decisionDraft&&<DecisionDraftModal draft={decisionDraft.data} busy={decisionBusy===decisionDraft.row.id} regenerate={decisionDraft.regenerate} onClose={()=>setDecisionDraft(null)} onSubmit={generateFromDraft}/>}
    </>
  );
}

function DecisionDraftModal({ draft, busy, regenerate, onClose, onSubmit }: { draft: ResignationDecisionDraft; busy:boolean; regenerate:boolean; onClose:()=>void; onSubmit:(event:FormEvent<HTMLFormElement>)=>void }) {
  return <div className="modal-backdrop"><form className="app-modal resignation-draft-modal" onSubmit={onSubmit}>
    <div className="modal-header"><div><span>Préparation du document</span><strong>{regenerate ? "Régénérer la décision" : "Décision de démission"}</strong></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="decision-source-grid">
      <SourceCard title="RH / BioTime" rows={[["Nom", draft.employee.name],["Matricule", draft.employee.matricule],["BioTime", draft.employee.biotimeCode],["Département", draft.employee.department],["Embauche", displayDate(draft.employee.hireDate)]]}/>
      <SourceCard title="SAP" rows={draft.sap ? [["Nom arabe", draft.sap.arabicName],["Nom SAP", draft.sap.name],["Code SAP", draft.sap.code],["Poste", draft.sap.poste],["Structure", draft.sap.structure],["Téléphone", draft.sap.phone]] : [["Statut", "Aucun lien SAP trouvé"]]}/>
      <SourceCard title="Société" rows={[["Unité", draft.unit.name],["Nom légal", draft.unit.legalName],["Signataire", draft.unit.gerantName],["Titre", draft.unit.gerantTitle]]}/>
    </div>
    {!!draft.missingFields.length&&<div className="alert alert-warning">Champs à vérifier : {draft.missingFields.join(", ")}</div>}
    <div className="decision-draft-form">
      <DraftField name="employeeName" label="Nom dans la décision" value={draft.decision.employeeName} source={draft.sources.employeeName}/>
      <DraftField name="employeePosition" label="Poste dans la décision" value={draft.decision.employeePosition} source={draft.sources.employeePosition}/>
      <DraftField name="contractDate" label="Date du contrat" type="date" value={draft.decision.contractDate} source={draft.sources.contractDate}/>
      <DraftField name="requestDate" label="Date demande démission" type="date" value={draft.decision.requestDate} source="Manuel / décision"/>
      <DraftField name="effectiveDate" label="Date effet décision" type="date" value={draft.decision.effectiveDate} source={draft.sources.effectiveDate}/>
      <DraftField name="gerantName" label="Signataire" value={draft.decision.gerantName} source={draft.sources.gerantName}/>
    </div>
    <div className="modal-actions"><Button type="button" variant="ghost" onClick={onClose}>Annuler</Button><Button type="submit" variant="primary" disabled={busy}>{busy ? "Génération..." : "Générer le PDF"}</Button></div>
  </form></div>;
}

function SourceCard({ title, rows }: { title:string; rows:Array<[string,string|null|undefined]> }) {
  return <div className="decision-source-card"><strong>{title}</strong>{rows.map(([label,value])=><span key={label}><small>{label}</small><b>{value || "-"}</b></span>)}</div>;
}

function DraftField({ name, label, value, source, type="text" }: { name:string; label:string; value:string|null|undefined; source?:string; type?:string }) {
  return <label className="filter-field"><span>{label}</span><input name={name} type={type} defaultValue={value || ""}/>{source&&<small>Source: {source}</small>}</label>;
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
