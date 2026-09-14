import { FileText, X } from "lucide-react";
import { FormEvent } from "react";
import { Button } from "./Button";
import { ResignationDecision, ResignationDecisionDraft } from "../lib/types";

type Props = {
  draft: ResignationDecisionDraft;
  busy: boolean;
  regenerate: boolean;
  onClose: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onDownload: (decision: ResignationDecision) => void;
};

export function HrDecisionDraftModal({ draft, busy, regenerate, onClose, onSubmit, onDownload }: Props) {
  const isPositionChange = draft.decision.decisionType === "POSITION_CHANGE";
  return <div className="modal-backdrop"><form className="app-modal resignation-draft-modal" onSubmit={onSubmit}>
    <div className="modal-header"><div><span>Préparation du document</span><strong>{isPositionChange ? "Décision changement de poste" : regenerate ? "Régénérer la décision" : "Décision de démission"}</strong></div><button type="button" className="icon-button" onClick={onClose}><X size={18}/></button></div>
    <div className="decision-source-grid">
      <SourceCard title="RH / BioTime" rows={[["Nom", draft.employee.name],["Matricule", draft.employee.matricule],["BioTime", draft.employee.biotimeCode],["Département", draft.employee.department],["Embauche", displayDate(draft.employee.hireDate)]]}/>
      <SourceCard title="SAP" rows={draft.sap ? [["Nom arabe", draft.sap.arabicName],["Nom SAP", draft.sap.name],["Code SAP", draft.sap.code],["Poste", draft.sap.poste],["Structure", draft.sap.structure],["Téléphone", draft.sap.phone]] : [["Statut", "Aucun lien SAP trouvé"]]}/>
      <SourceCard title="Société" rows={[["Unité", draft.unit.name],["Nom légal", draft.unit.legalName],["Signataire", draft.unit.gerantName],["Titre", draft.unit.gerantTitle]]}/>
    </div>
    {!!draft.missingFields.length&&<div className="alert alert-warning">Champs à vérifier : {draft.missingFields.join(", ")}</div>}
    {!!draft.history.length&&<div className="decision-archive"><strong>Archive décisions</strong>{draft.history.map(item=><button type="button" key={item.id} onClick={()=>onDownload(item)}><FileText size={13}/> {decisionLabel(item.decisionType)} · {item.decisionNumber} · {displayDate(item.decisionDate)}</button>)}</div>}
    <input type="hidden" name="decisionType" value={draft.decision.decisionType}/>
    <div className="decision-draft-form">
      <DraftField name="employeeName" label="Nom dans la décision" value={draft.decision.employeeName} source={draft.sources.employeeName}/>
      <DraftField name="employeePosition" label={isPositionChange ? "Poste actuel" : "Poste dans la décision"} value={draft.decision.employeePosition} source={draft.sources.employeePosition}/>
      {isPositionChange&&<>
        <DraftField name="employeeNumber" label="Numéro fonctionnel" value={draft.decision.employeeNumber} source={draft.sources.employeeNumber}/>
        <DraftField name="hireDate" label="Date de recrutement" type="date" value={draft.decision.hireDate} source={draft.sources.hireDate}/>
        <DraftField name="newPosition" label="Nouveau poste" value={draft.decision.newPosition} source={draft.sources.newPosition}/>
        <DraftField name="grade" label="Grade / degré" value={draft.decision.grade} source={draft.sources.grade}/>
        <DraftField name="category" label="Catégorie / صنف" value={draft.decision.category} source={draft.sources.category}/>
      </>}
      <DraftField name="decisionDate" label={isPositionChange ? "Date décision / année séquence" : "Date création décision — عين مليلة في"} type="date" value={draft.decision.decisionDate} source="Utilisée par {{decision_date}}, l'année et la séquence"/>
      {!isPositionChange&&<DraftField name="contractDate" label="Date du contrat" type="date" value={draft.decision.contractDate} source={`${draft.sources.contractDate || "Contrat RH"} — modifiable uniquement pour ce document`}/>} 
      {!isPositionChange&&<DraftField name="requestDate" label="Date demande démission" type="date" value={draft.decision.requestDate} source="Manuel / décision"/>}
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

function decisionLabel(type: string) {
  return type === "POSITION_CHANGE" ? "Changement poste" : "Démission";
}

function displayDate(value?: string | null) {
  if (!value) return "-";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}
