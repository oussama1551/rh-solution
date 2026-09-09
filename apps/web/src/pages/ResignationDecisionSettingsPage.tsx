import { RotateCcw, Save, Upload } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "../components/Button";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi } from "../lib/useApi";

type LegalUnit = { id:string; name:string; code:string; legalLogoPath:string|null; fullLegalName:string|null; legalForm:string|null; legalAddress:string|null; capitalSocial:string|null; rcNumber:string|null; nifNumber:string|null; artNumber:string|null; legalPhones:string|null; legalEmail:string|null; legalWebsite:string|null; gerantName:string|null; gerantTitle:string|null; resignationDecisionTemplate:string|null; positionChangeDecisionTemplate:string|null };
const fields: Array<[keyof LegalUnit,string]> = [["gerantName","Nom du signataire par défaut"],["gerantTitle","Titre du signataire"]];
const variables = ["{{employee_name}}", "{{employee_position}}", "{{employee_number}}", "{{new_position}}", "{{grade}}", "{{category}}", "{{decision_title}}", "{{decision_number}}", "{{decision_number_ar}}", "{{decision_sequence}}", "{{decision_year}}", "{{decision_date}}", "{{hire_date}}", "{{contract_date}}", "{{request_date}}", "{{effective_date}}", "{{effective_date_ar}}", "{{company_legal_name}}", "{{gerant_name}}"];
const officialResignationTemplate = `المديريــــــــــــــة العامـــــــــــــــة
مديريـــــــــة الموارد البشريـــــــــة
رقم {{decision_sequence}} / م ع/ م م ب/{{decision_year}}
قـــــــرار الاستقالـــة

- بمقتضى عقد تأسيس الشركة رقم 40/2011 الصادر في 10/01/2011 المتضمن انشاء شركة ذات المسؤولية المحدودة "فابكوم"
- بمقتضى عقد تعديل القانون الأساسي للشركة رقم 970/2017 الصادر في 21 و 25/12/2017 المتضمن تعيين السيد: عطية عصام مسير لشركة فابكوم ش.ذ.م.م
- بمقتضى القانون 90-11 في 23/04/1990 والمتعلق بعلاقات العمل سيما المادة 12.
- بناء على النظام الداخلي للمؤسسة المؤرخ في 20 مارس 2022.
- بمقتضى احكام المواد 12 و13 من عقد عمل المعني المؤرخ في {{contract_date}}
- بناء على طلب المعني الاستقالة من منصب عمله المؤرخ في {{request_date}}
- بناء على قبولنا.

يقـــــــــــــــــــــــــــــــــرر

المادة 01: يوافق على استقالة السيد {{employee_name}} من منصب {{employee_position}}.
المادة 02: يسرى مفعول هذا القرار ابتداء من تاريخ {{effective_date_ar}}
المادة 03: يلتزم المعني بإعادة معدات الشركة التي في حوزته مقابل استفادته من شهادة العمل وتصفية كل الحساب
المادة 04: يكلف مدير الموارد البشرية ومسؤول الإنتاج ومسؤول المالية والمحاسبة بتنفيذ هذا القرار.

نسخة:
المعنـــــــي
ملف المعني

مسير الشركة
{{gerant_name}}`;
const officialPositionChangeTemplate = `المديريــــــــــــــة العامـــــــــــــــة
مديريـــــــــة الموارد البشريـــــــــة
رقم {{decision_sequence}} / م ع/ م م ب/{{decision_year}}
قـــــــرار

- بمقتضى عقد تأسيس الشركة رقم 40/2011 الصادر في 10/01/2011 المتضمن انشاء شركة ذات المسؤولية المحدودة "فابكوم"
- بمقتضى عقد تعديل القانون الأساسي للشركة رقم 970/2017 الصادر في 21 و 25/12/2017 المتضمن تعيين السيد: عطية عصام مسير لشركة فابكوم ش.ذ.م.م
- بمقتضى القانون 90-11 في 23/04/1990 والمتعلق بعلاقات العمل سيما المادة 12.
- بناء على النظام الداخلي للمؤسسة المؤرخ في 20 مارس 2022.
- بناء على طلب تغيير المنصب للسيد: {{employee_name}}.

يقـــــــــــــــــــــــــــــــــرر

المادة 01: السيد/السيدة: {{employee_name}}، المنصب: {{employee_position}}، الرقم الوظيفي {{employee_number}}
تاريخ التوظيف: {{hire_date}}، يتغير الى منصب {{new_position}}، الدرجة {{grade}} الصنف {{category}}.
المادة 02: يسرى مفعول هذا القرار ابتداء من تاريخ {{effective_date}}.
المادة 03: يكلف مدير الموارد البشرية ومسؤول الإنتاج ومسؤول المالية والمحاسبة بتنفيذ هذا القرار.

مسير الشركة
{{gerant_name}}`;

export function ResignationDecisionSettingsPage() {
  const { user } = useAuth(); const units = useApi<LegalUnit[]>("/api/resignation-decisions/units", []); const [selectedId,setSelectedId]=useState(""); const [form,setForm]=useState<LegalUnit|null>(null); const [message,setMessage]=useState("");
  const [templateType,setTemplateType]=useState<"RESIGNATION"|"POSITION_CHANGE">("RESIGNATION");
  useEffect(()=>{ const selected=units.data.find(x=>x.id===(selectedId||units.data[0]?.id)); if(selected){setSelectedId(selected.id);setForm({...selected});}},[units.data,selectedId]);
  if (!user?.roles.includes("ADMIN")) return <div className="alert alert-error">Accès réservé à Admin.</div>;
  const templateKey = templateType === "POSITION_CHANGE" ? "positionChangeDecisionTemplate" : "resignationDecisionTemplate";
  const activeTemplate = form?.[templateKey] || "";
  const officialTemplate = templateType === "POSITION_CHANGE" ? officialPositionChangeTemplate : officialResignationTemplate;
  const requiredTokens = templateType === "POSITION_CHANGE" ? ["{{employee_name}}", "{{employee_position}}", "{{new_position}}", "{{hire_date}}", "{{effective_date}}"] : ["{{employee_name}}", "{{employee_position}}", "{{contract_date}}", "{{request_date}}"];
  const templateNeedsVariables = form ? !requiredTokens.every(token => activeTemplate.includes(token)) : false;
  async function save(){ if(!form)return; await api(`/api/resignation-decisions/units/${form.id}`,{method:"PATCH",body:JSON.stringify(form)}); setMessage("Profil juridique et modèle enregistrés."); await units.reload(); }
  async function logo(file?:File){if(!file||!form)return;const body=new FormData();body.append("logo",file);await api(`/api/resignation-decisions/units/${form.id}/logo`,{method:"POST",body});setMessage("Logo enregistré.");await units.reload();}
  return <><PageHeader title="Décisions RH — sociétés"/><section className="panel resignation-settings">
    {message&&<div className="alert alert-success">{message}</div>}
    <div className="tabs">{units.data.map(unit=><button key={unit.id} className={`tab ${selectedId===unit.id?"active":""}`} onClick={()=>setSelectedId(unit.id)}>{unit.name}</button>)}</div>
    {form&&<><div className="legal-profile-grid logo-only-profile"><div className="logo-editor"><div className="logo-preview">{form.legalLogoPath?<img src={`/api/resignation-decisions/units/${form.id}/logo`} alt="Logo"/>:<span>Aucun logo</span>}</div><label className="btn btn-secondary"><Upload size={15}/> Charger logo PNG/JPG<input hidden type="file" accept="image/png,image/jpeg" onChange={e=>logo(e.target.files?.[0])}/></label></div><div className="form-grid">{fields.map(([key,label])=><label key={key as string}><span>{label}</span><input value={String(form[key]||"")} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</div></div>
      <div className="template-heading"><strong>Modèle arabe entièrement modifiable</strong><div className="row-actions"><div className="segmented-control"><button type="button" className={templateType==="RESIGNATION"?"active":""} onClick={()=>setTemplateType("RESIGNATION")}>Démission</button><button type="button" className={templateType==="POSITION_CHANGE"?"active":""} onClick={()=>setTemplateType("POSITION_CHANGE")}>Changement de poste</button></div><Button type="button" variant="secondary" onClick={()=>setForm({...form,[templateKey]:officialTemplate})}><RotateCcw size={14}/> Modèle officiel avec variables</Button></div></div>
      {templateNeedsVariables&&<div className="alert alert-warning">Ce modèle contient probablement des valeurs fixes. Utilisez le modèle officiel pour que nom, poste et dates changent selon l'employé.</div>}
      <label className="template-editor"><textarea dir="rtl" rows={15} value={activeTemplate} onChange={e=>setForm({...form,[templateKey]:e.target.value})}/></label>
      <div className="variable-help"><strong>Variables disponibles :</strong>{variables.map(v=><button type="button" key={v} onClick={()=>setForm({...form,[templateKey]:`${activeTemplate}${v}`})}>{v}</button>)}</div>
      <Button onClick={save}><Save size={15}/> Enregistrer</Button></>}
  </section></>;
}
