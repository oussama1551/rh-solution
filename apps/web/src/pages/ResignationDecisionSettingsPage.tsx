import { AlignCenter, AlignLeft, AlignRight, Bold, Heading1, List, Pilcrow, RotateCcw, Save, Signature, TextCursorInput, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
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
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  useEffect(()=>{ const selected=units.data.find(x=>x.id===(selectedId||units.data[0]?.id)); if(selected){setSelectedId(selected.id);setForm({...selected});}},[units.data,selectedId]);
  if (!user?.roles.includes("ADMIN")) return <div className="alert alert-error">Accès réservé à Admin.</div>;
  const templateKey = templateType === "POSITION_CHANGE" ? "positionChangeDecisionTemplate" : "resignationDecisionTemplate";
  const activeTemplate = form?.[templateKey] || "";
  const officialTemplate = templateType === "POSITION_CHANGE" ? officialPositionChangeTemplate : officialResignationTemplate;
  const requiredTokens = templateType === "POSITION_CHANGE" ? ["{{employee_name}}", "{{employee_position}}", "{{new_position}}", "{{hire_date}}", "{{effective_date}}"] : ["{{employee_name}}", "{{employee_position}}", "{{contract_date}}", "{{request_date}}"];
  const templateNeedsVariables = form ? !requiredTokens.every(token => activeTemplate.includes(token)) : false;
  function updateTemplate(value: string) { if (form) setForm({ ...form, [templateKey]: value }); }
  function insertText(value: string) {
    const textarea = editorRef.current;
    if (!textarea) return updateTemplate(`${activeTemplate}${value}`);
    const start = textarea.selectionStart ?? activeTemplate.length;
    const end = textarea.selectionEnd ?? start;
    const next = `${activeTemplate.slice(0, start)}${value}${activeTemplate.slice(end)}`;
    updateTemplate(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + value.length, start + value.length);
    });
  }
  function wrapText(prefix: string, suffix = prefix, placeholder = "النص") {
    const textarea = editorRef.current;
    if (!textarea) return insertText(`${prefix}${placeholder}${suffix}`);
    const start = textarea.selectionStart ?? activeTemplate.length;
    const end = textarea.selectionEnd ?? start;
    const selected = activeTemplate.slice(start, end) || placeholder;
    const next = `${activeTemplate.slice(0, start)}${prefix}${selected}${suffix}${activeTemplate.slice(end)}`;
    updateTemplate(next);
    window.requestAnimationFrame(() => {
      textarea.focus();
      textarea.setSelectionRange(start + prefix.length, start + prefix.length + selected.length);
    });
  }
  function alignCurrentLine(direction: "right" | "center" | "left") {
    const textarea = editorRef.current;
    const cursor = textarea?.selectionStart ?? activeTemplate.length;
    const lineStart = activeTemplate.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const lineEndIndex = activeTemplate.indexOf("\n", cursor);
    const lineEnd = lineEndIndex === -1 ? activeTemplate.length : lineEndIndex;
    const currentLine = activeTemplate.slice(lineStart, lineEnd).replace(/^::(center|left|right)::\s*/, "");
    const nextLine = direction === "right" ? currentLine : `::${direction}:: ${currentLine}`;
    const next = `${activeTemplate.slice(0, lineStart)}${nextLine}${activeTemplate.slice(lineEnd)}`;
    updateTemplate(next);
    window.requestAnimationFrame(() => {
      textarea?.focus();
      const nextCursor = lineStart + nextLine.length;
      textarea?.setSelectionRange(nextCursor, nextCursor);
    });
  }
  async function save(){ if(!form)return; await api(`/api/resignation-decisions/units/${form.id}`,{method:"PATCH",body:JSON.stringify(form)}); setMessage("Profil juridique et modèle enregistrés."); await units.reload(); }
  async function logo(file?:File){if(!file||!form)return;const body=new FormData();body.append("logo",file);await api(`/api/resignation-decisions/units/${form.id}/logo`,{method:"POST",body});setMessage("Logo enregistré.");await units.reload();}
  return <><PageHeader title="Décisions RH — sociétés"/><section className="panel resignation-settings">
    {message&&<div className="alert alert-success">{message}</div>}
    <div className="tabs">{units.data.map(unit=><button key={unit.id} className={`tab ${selectedId===unit.id?"active":""}`} onClick={()=>setSelectedId(unit.id)}>{unit.name}</button>)}</div>
    {form&&<><div className="legal-profile-grid logo-only-profile"><div className="logo-editor"><div className="logo-preview">{form.legalLogoPath?<img src={`/api/resignation-decisions/units/${form.id}/logo`} alt="Logo"/>:<span>Aucun logo</span>}</div><label className="btn btn-secondary"><Upload size={15}/> Charger logo PNG/JPG<input hidden type="file" accept="image/png,image/jpeg" onChange={e=>logo(e.target.files?.[0])}/></label></div><div className="form-grid">{fields.map(([key,label])=><label key={key as string}><span>{label}</span><input value={String(form[key]||"")} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}</div></div>
      <div className="template-heading"><strong>Modèle arabe entièrement modifiable</strong><div className="row-actions"><div className="segmented-control"><button type="button" className={templateType==="RESIGNATION"?"active":""} onClick={()=>setTemplateType("RESIGNATION")}>Démission</button><button type="button" className={templateType==="POSITION_CHANGE"?"active":""} onClick={()=>setTemplateType("POSITION_CHANGE")}>Changement de poste</button></div><Button type="button" variant="secondary" onClick={()=>setForm({...form,[templateKey]:officialTemplate})}><RotateCcw size={14}/> Modèle officiel avec variables</Button></div></div>
      {templateNeedsVariables&&<div className="alert alert-warning">Ce modèle contient probablement des valeurs fixes. Utilisez le modèle officiel pour que nom, poste et dates changent selon l'employé.</div>}
      <div className="decision-word-editor">
        <div className="decision-editor-toolbar">
          <button type="button" onClick={()=>wrapText("**", "**", "نص مهم")}><Bold size={14}/> Gras</button>
          <button type="button" onClick={()=>wrapText("[[small]]", "[[/small]]", "نص صغير")}><TextCursorInput size={14}/> Petit</button>
          <button type="button" onClick={()=>wrapText("[[large]]", "[[/large]]", "نص كبير")}><TextCursorInput size={14}/> Grand</button>
          <button type="button" onClick={()=>alignCurrentLine("right")}><AlignRight size={14}/> Droite</button>
          <button type="button" onClick={()=>alignCurrentLine("center")}><AlignCenter size={14}/> Centre</button>
          <button type="button" onClick={()=>alignCurrentLine("left")}><AlignLeft size={14}/> Gauche</button>
          <button type="button" onClick={()=>wrapText("[[rtl]]", "[[/rtl]]", "نص عربي")}><AlignRight size={14}/> RTL</button>
          <button type="button" onClick={()=>wrapText("[[ltr]]", "[[/ltr]]", "Texte latin")}><AlignLeft size={14}/> LTR</button>
          <button type="button" onClick={()=>insertText("\nقـــــــرار\n")}><Heading1 size={14}/> Titre</button>
          <button type="button" onClick={()=>insertText("\n- ")}><List size={14}/> Puce</button>
          <button type="button" onClick={()=>insertText("\nالمادة 01: ")}><Pilcrow size={14}/> Article</button>
          <button type="button" onClick={()=>insertText("\n\nمسير الشركة\n{{gerant_name}}")}><Signature size={14}/> Signature</button>
        </div>
        <div className="decision-editor-grid">
          <label className="template-editor"><span>Texte du modèle</span><textarea ref={editorRef} dir="rtl" rows={20} value={activeTemplate} onChange={e=>updateTemplate(e.target.value)}/></label>
          <div className="decision-template-preview" dir="rtl">
            <span>Aperçu rapide</span>
            <div>{activeTemplate.split(/\r?\n/).map((line,index)=><PreviewLine key={`${index}-${line}`} line={line}/>)}</div>
          </div>
        </div>
      </div>
      <div className="variable-help"><strong>Variables disponibles :</strong>{variables.map(v=><button type="button" key={v} onClick={()=>insertText(v)}>{v}</button>)}</div>
      <Button onClick={save}><Save size={15}/> Enregistrer</Button></>}
  </section></>;
}

function PreviewLine({ line }: { line: string }) {
  let text = line.trim();
  const align = text.match(/^::(center|left|right)::\s*(.*)$/);
  if (align) text = align[2];
  const className = `${!text ? "blank" : /^-/.test(text) ? "recital" : /^يق/.test(text) ? "center" : /^(المديري|مديري|رقم|قـ|قــــ)/.test(text) ? "head" : /^المادة\s+\d+\s*:/.test(text) ? "article" : /^(مسير الشركة|{{gerant_name}})/.test(text) ? "signature" : ""} ${align ? `align-${align[1]}` : ""}`;
  return <p className={className}>{renderInline(text)}</p>;
}

function renderInline(value: string) {
  const parts = value.split(/(\{\{[^}]+\}\}|\*\*[^*]+\*\*|\[\[(?:small|large|ltr|rtl)\]\].+?\[\[\/(?:small|large|ltr|rtl)\]\])/g).filter(Boolean);
  return parts.map((part, index) => {
    if (/^\{\{[^}]+\}\}$/.test(part)) return <code key={index}>{part}</code>;
    if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={index}>{part.slice(2, -2)}</strong>;
    if (/^\[\[small\]\].+\[\[\/small\]\]$/.test(part)) return <span className="text-small" key={index}>{part.replace(/^\[\[small\]\]|\[\[\/small\]\]$/g, "")}</span>;
    if (/^\[\[large\]\].+\[\[\/large\]\]$/.test(part)) return <span className="text-large" key={index}>{part.replace(/^\[\[large\]\]|\[\[\/large\]\]$/g, "")}</span>;
    if (/^\[\[ltr\]\].+\[\[\/ltr\]\]$/.test(part)) return <span className="text-ltr" dir="ltr" key={index}>{part.replace(/^\[\[ltr\]\]|\[\[\/ltr\]\]$/g, "")}</span>;
    if (/^\[\[rtl\]\].+\[\[\/rtl\]\]$/.test(part)) return <span className="text-rtl" dir="rtl" key={index}>{part.replace(/^\[\[rtl\]\]|\[\[\/rtl\]\]$/g, "")}</span>;
    return <span key={index}>{part}</span>;
  });
}
