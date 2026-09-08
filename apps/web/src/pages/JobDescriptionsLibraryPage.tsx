import { BookOpenText, BriefcaseBusiness, Building2, Check, FileText, FileUp, ListChecks, Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import { ChangeEvent, FormEvent, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api, fileUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { JobCompany, JobPosition, MissionLibraryItem } from "../lib/types";
import { useApi } from "../lib/useApi";

type Tab = "positions" | "missions" | "companies";

const emptyCompany = { code: "", officialName: "", shortName: "", address: "", phone: "", email: "", legalInfo: "", primaryColor: "#0f766e", footerText: "" };
const emptyPosition = { companyId: "", code: "", title: "", direction: "", department: "", service: "", hierarchicalReporting: "", functionalReporting: "", aliases: "" };
const emptyMission = { companyId: "", category: "", code: "", label: "", description: "", taskType: "", frequency: "", priority: "", essential: false };

export function JobDescriptionsLibraryPage() {
  const { can } = useAuth();
  const [tab, setTab] = useState<Tab>("positions");
  const companies = useApi<JobCompany[]>("/api/job-descriptions/companies?includeInactive=true", []);
  const positions = useApi<JobPosition[]>("/api/job-descriptions/positions?includeInactive=true", []);
  const missions = useApi<MissionLibraryItem[]>("/api/job-descriptions/missions?includeInactive=true", []);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function reloadAll() {
    companies.reload();
    positions.reload();
    missions.reload();
  }

  function success(text: string) {
    setMessage(text);
    setError(null);
    reloadAll();
  }

  function failure(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Opération impossible.");
    setMessage(null);
  }

  return (
    <>
      <PageHeader title="Fiches de poste" actions={<div className="row-actions"><Link className="btn btn-secondary" to="/job-descriptions/documents"><FileText size={15} /> Fiches salariés</Link>{can("job_description.create") && <Link className="btn btn-primary" to="/job-descriptions/new"><Plus size={15} /> Nouvelle fiche</Link>}{can("job_template.manage") && <Link className="btn btn-secondary" to="/job-descriptions/import"><FileUp size={15} /> Importer le manuel</Link>}{(can("job_description.validate") || can("job_template.manage")) && <Link className="btn btn-secondary" to="/job-descriptions/validation"><ShieldCheck size={15} /> Validations & circuits</Link>}</div>} />
      <section className="panel job-library-panel">
        <div className="job-library-intro">
          <div className="job-library-icon"><BookOpenText size={25} /></div>
          <div>
            <strong>Bibliothèque professionnelle des postes</strong>
            <span>Préparez les sociétés, postes, modèles et missions avant la génération des fiches individuelles.</span>
          </div>
          <div className="job-library-counts">
            <span><b>{positions.data.filter(row => row.isActive).length}</b> postes</span>
            <span><b>{missions.data.filter(row => row.isActive).length}</b> missions</span>
            <span><b>{companies.data.filter(row => row.isActive).length}</b> sociétés</span>
          </div>
        </div>
        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{cleanApiError(error)}</div>}
        <div className="tabs job-library-tabs">
          <button className={tab === "positions" ? "active" : ""} onClick={() => setTab("positions")}><BriefcaseBusiness size={16} /> Postes & modèles</button>
          <button className={tab === "missions" ? "active" : ""} onClick={() => setTab("missions")}><ListChecks size={16} /> Missions</button>
          <button className={tab === "companies" ? "active" : ""} onClick={() => setTab("companies")}><Building2 size={16} /> Sociétés</button>
        </div>
        {tab === "positions" && <PositionsTab rows={positions.data} companies={companies.data} loading={positions.loading} canManage={can("job_template.manage")} onSuccess={success} onError={failure} />}
        {tab === "missions" && <MissionsTab rows={missions.data} companies={companies.data} loading={missions.loading} canManage={can("mission_library.manage")} onSuccess={success} onError={failure} />}
        {tab === "companies" && <CompaniesTab rows={companies.data} loading={companies.loading} canManage={can("company_branding.manage")} onSuccess={success} onError={failure} />}
      </section>
    </>
  );
}

function CompaniesTab({ rows, loading, canManage, onSuccess, onError }: { rows: JobCompany[]; loading: boolean; canManage: boolean; onSuccess: (text: string) => void; onError: (error: unknown) => void }) {
  const [editor, setEditor] = useState<JobCompany | "new" | null>(null);
  const [form, setForm] = useState(emptyCompany);
  const [saving, setSaving] = useState(false);

  async function uploadLogo(row: JobCompany, event: ChangeEvent<HTMLInputElement>) { const file = event.target.files?.[0]; event.target.value = ""; if (!file) return; if (file.type !== "image/png") return onError(new Error("Sélectionnez uniquement un fichier PNG.")); const body = new FormData(); body.append("logo", file); try { await api(`/api/job-descriptions/companies/${row.id}/logo`, { method: "POST", body }); onSuccess(`Logo PNG de ${row.shortName} enregistré.`); } catch (reason) { onError(reason); } }

  function open(row?: JobCompany) {
    setEditor(row || "new");
    setForm(row ? { code: row.code, officialName: row.officialName, shortName: row.shortName, address: row.address || "", phone: row.phone || "", email: row.email || "", legalInfo: row.legalInfo || "", primaryColor: row.primaryColor || "#0f766e", footerText: row.footerText || "" } : emptyCompany);
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const isNew = editor === "new";
      const payload = isNew ? form : { officialName: form.officialName, shortName: form.shortName, address: form.address, phone: form.phone, email: form.email, legalInfo: form.legalInfo, primaryColor: form.primaryColor, footerText: form.footerText };
      await api(isNew ? "/api/job-descriptions/companies" : `/api/job-descriptions/companies/${(editor as JobCompany).id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) });
      setEditor(null);
      onSuccess(isNew ? "Société créée." : "Configuration de la société enregistrée.");
    } catch (reason) { onError(reason); } finally { setSaving(false); }
  }

  return <div className="stack">
    <div className="panel-header"><div><h2>Sociétés et identité documentaire</h2><span className="muted">Les coordonnées seront figées dans chaque version de fiche.</span></div>{canManage && <Button variant="primary" onClick={() => open()}><Plus size={16} /> Nouvelle société</Button>}</div>
    <div className="company-card-grid">
      {rows.map(row => <article key={row.id} className={`company-config-card ${!row.isActive ? "is-disabled" : ""}`} style={{ borderTopColor: row.primaryColor || "#0f766e" }}>
        <div className="company-config-head"><div className="company-logo-placeholder" style={{ background: row.brandings.length ? "#fff" : row.primaryColor || "#0f766e" }}>{row.brandings.length ? <img src={`${fileUrl(`/api/job-descriptions/companies/${row.id}/logo`, new URLSearchParams())}&v=${row.brandings[0].sha256 || row.brandings[0].id}`} alt={`Logo ${row.shortName}`} /> : row.shortName.slice(0, 2).toUpperCase()}</div><div><strong>{row.officialName}</strong><span>{row.code}</span></div><StatusBadge value={row.isActive ? "ACTIVE" : "ARCHIVED"} label={row.isActive ? "Active" : "Inactive"} /></div>
        <dl className="company-config-details"><div><dt>Adresse</dt><dd>{row.address || "Non renseignée"}</dd></div><div><dt>Téléphone</dt><dd>{row.phone || "-"}</dd></div><div><dt>E-mail</dt><dd>{row.email || "-"}</dd></div></dl>
        <div className="company-card-footer"><span>{row.brandings.length ? "Logo PNG configuré" : "Logo PNG requis"}</span>{canManage && <label className="btn btn-ghost company-logo-upload"><FileUp size={14} /> {row.brandings.length ? "Remplacer PNG" : "Ajouter PNG"}<input hidden type="file" accept="image/png,.png" onChange={event => uploadLogo(row, event)} /></label>}{canManage && <Button variant="ghost" onClick={() => open(row)}><Pencil size={15} /> Modifier</Button>}</div>
      </article>)}
    </div>
    {editor && <EditorModal title={editor === "new" ? "Nouvelle société" : `Modifier ${(editor as JobCompany).code}`} onClose={() => setEditor(null)}>
      <form className="job-editor-form" onSubmit={save}>
        <div className="job-form-grid"><Field label="Code"><input value={form.code} disabled={editor !== "new"} required onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field><Field label="Nom officiel"><input value={form.officialName} required onChange={event => setForm({ ...form, officialName: event.target.value })} /></Field><Field label="Nom court"><input value={form.shortName} required onChange={event => setForm({ ...form, shortName: event.target.value })} /></Field><Field label="Couleur principale"><div className="color-field"><input type="color" value={form.primaryColor} onChange={event => setForm({ ...form, primaryColor: event.target.value })} /><input value={form.primaryColor} onChange={event => setForm({ ...form, primaryColor: event.target.value })} /></div></Field><Field label="Téléphone"><input value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></Field><Field label="E-mail"><input type="email" value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></Field></div>
        <Field label="Adresse"><textarea rows={2} value={form.address} onChange={event => setForm({ ...form, address: event.target.value })} /></Field><Field label="Informations légales"><textarea rows={2} value={form.legalInfo} onChange={event => setForm({ ...form, legalInfo: event.target.value })} /></Field><Field label="Pied de page"><textarea rows={2} value={form.footerText} onChange={event => setForm({ ...form, footerText: event.target.value })} /></Field>
        <EditorActions saving={saving} onCancel={() => setEditor(null)} />
      </form>
    </EditorModal>}
  </div>;
}

function PositionsTab({ rows, companies, loading, canManage, onSuccess, onError }: { rows: JobPosition[]; companies: JobCompany[]; loading: boolean; canManage: boolean; onSuccess: (text: string) => void; onError: (error: unknown) => void }) {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [companyId, setCompanyId] = useState("");
  const [editor, setEditor] = useState<JobPosition | "new" | null>(null);
  const [templateFor, setTemplateFor] = useState<JobPosition | null>(null);
  const [form, setForm] = useState(emptyPosition);
  const [saving, setSaving] = useState(false);
  const filtered = useMemo(() => rows.filter(row => (!companyId || !row.companyId || row.companyId === companyId) && (!search.trim() || `${row.code} ${row.title} ${row.direction || ""} ${row.department || ""} ${row.aliases.map(alias => alias.sourceValue).join(" ")}`.toLowerCase().includes(search.trim().toLowerCase()))), [rows, companyId, search]);

  function open(row?: JobPosition) {
    setEditor(row || "new");
    setForm(row ? { companyId: row.companyId || "", code: row.code, title: row.title, direction: row.direction || "", department: row.department || "", service: row.service || "", hierarchicalReporting: row.hierarchicalReporting || "", functionalReporting: row.functionalReporting || "", aliases: row.aliases.map(alias => alias.sourceValue).join("\n") } : emptyPosition);
  }

  async function save(event: FormEvent) {
    event.preventDefault(); setSaving(true);
    try {
      const isNew = editor === "new";
      const aliases = form.aliases.split(/\r?\n|,/).map(value => value.trim()).filter(Boolean);
      const payload = isNew
        ? { ...form, companyId: form.companyId || undefined, aliases }
        : { title: form.title, direction: form.direction, department: form.department, service: form.service, hierarchicalReporting: form.hierarchicalReporting, functionalReporting: form.functionalReporting, aliases };
      await api(isNew ? "/api/job-descriptions/positions" : `/api/job-descriptions/positions/${(editor as JobPosition).id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify(payload) });
      setEditor(null); onSuccess(isNew ? "Poste ajouté à la bibliothèque." : "Poste mis à jour.");
    } catch (reason) { onError(reason); } finally { setSaving(false); }
  }

  return <div className="stack">
    <div className="library-toolbar"><div className="input-icon library-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Code, poste, alias SAP, département..." /></div><select value={companyId} onChange={event => setCompanyId(event.target.value)}><option value="">Toutes les sociétés</option>{companies.filter(row => row.isActive).map(row => <option key={row.id} value={row.id}>{row.shortName}</option>)}</select>{canManage && <Button variant="primary" onClick={() => open()}><Plus size={16} /> Nouveau poste</Button>}</div>
    <DataTable rows={filtered} loading={loading} pageSize={25} empty="Aucun poste dans la bibliothèque." columns={[
      { key: "code", header: "Code", render: row => <span className="job-code-chip">{row.code}</span>, sortValue: row => row.code },
      { key: "title", header: "Intitulé", render: row => <div className="job-title-cell"><strong>{row.title}</strong><span>{row.aliases.length ? `${row.aliases.length} alias SAP` : "Aucun alias SAP"}</span></div>, sortValue: row => row.title },
      { key: "company", header: "Société", render: row => row.company?.shortName || <span className="scope-chip">Commun</span>, sortValue: row => row.company?.shortName || "" },
      { key: "org", header: "Direction / Département / Service", render: row => [row.direction, row.department, row.service].filter(Boolean).join(" › ") || "-" },
      { key: "templates", header: "Modèles", render: row => <button className="template-count-button" onClick={() => setTemplateFor(row)}><b>{row.templates.length}</b><span>modèle(s)</span></button>, sortValue: row => row.templates.length },
      { key: "status", header: "Statut", render: row => <StatusBadge value={row.isActive ? "ACTIVE" : "ARCHIVED"} label={row.isActive ? "Actif" : "Inactif"} /> },
      { key: "actions", header: "Actions", render: row => <div className="row-actions"><Button variant="ghost" onClick={() => setTemplateFor(row)}>Modèles</Button>{canManage && <Button variant="ghost" onClick={() => open(row)}><Pencil size={14} /> Modifier</Button>}</div> }
    ]} />
    {editor && <EditorModal title={editor === "new" ? "Nouveau poste" : `Modifier ${(editor as JobPosition).title}`} onClose={() => setEditor(null)}><form className="job-editor-form" onSubmit={save}><div className="job-form-grid"><Field label="Société"><select value={form.companyId} disabled={editor !== "new"} onChange={event => setForm({ ...form, companyId: event.target.value })}><option value="">Poste commun</option>{companies.filter(row => row.isActive).map(row => <option key={row.id} value={row.id}>{row.shortName}</option>)}</select></Field><Field label="Code poste"><input value={form.code} disabled={editor !== "new"} required onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field><Field label="Intitulé"><input value={form.title} required onChange={event => setForm({ ...form, title: event.target.value })} /></Field><Field label="Direction"><input value={form.direction} onChange={event => setForm({ ...form, direction: event.target.value })} /></Field><Field label="Département"><input value={form.department} onChange={event => setForm({ ...form, department: event.target.value })} /></Field><Field label="Service"><input value={form.service} onChange={event => setForm({ ...form, service: event.target.value })} /></Field><Field label="Rattachement hiérarchique"><input value={form.hierarchicalReporting} onChange={event => setForm({ ...form, hierarchicalReporting: event.target.value })} /></Field><Field label="Rattachement fonctionnel"><input value={form.functionalReporting} onChange={event => setForm({ ...form, functionalReporting: event.target.value })} /></Field></div><Field label="Alias SAP — un intitulé par ligne"><textarea rows={5} value={form.aliases} onChange={event => setForm({ ...form, aliases: event.target.value })} placeholder="RESPONSABLE IT&#10;RESP. INFORMATIQUE" /></Field><EditorActions saving={saving} onCancel={() => setEditor(null)} /></form></EditorModal>}
    {templateFor && <TemplatesModal position={templateFor} canManage={canManage} canValidate={can("job_description.validate")} onClose={() => setTemplateFor(null)} onSuccess={text => { setTemplateFor(null); onSuccess(text); }} onError={onError} />}
  </div>;
}

function TemplatesModal({ position, canManage, canValidate, onClose, onSuccess, onError }: { position: JobPosition; canManage: boolean; canValidate: boolean; onClose: () => void; onSuccess: (text: string) => void; onError: (error: unknown) => void }) {
  const workflows = useApi<Array<{ id: string; name: string }>>("/api/job-descriptions/workflows", []);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [theme, setTheme] = useState("corporate");
  const [orientation, setOrientation] = useState("portrait");
  const [workflowId, setWorkflowId] = useState("");
  const [saving, setSaving] = useState(false);
  async function create(event: FormEvent) { event.preventDefault(); setSaving(true); try { await api("/api/job-descriptions/templates", { method: "POST", body: JSON.stringify({ jobPositionId: position.id, companyId: position.companyId || undefined, workflowId: workflowId || undefined, name, visualTheme: theme, orientation, content: blankBuilder(theme, orientation) }) }); onSuccess("Modèle brouillon créé."); } catch (reason) { onError(reason); } finally { setSaving(false); } }
  async function setWorkflow(templateId: string, value: string) { try { await api(`/api/job-descriptions/templates/${templateId}/workflow`, { method: "PATCH", body: JSON.stringify({ workflowId: value || undefined }) }); onSuccess("Circuit du modèle mis à jour."); } catch (reason) { onError(reason); } }
  async function validate(id: string) { try { await api(`/api/job-descriptions/templates/${id}/validate`, { method: "POST" }); onSuccess("Modèle validé."); } catch (reason) { onError(reason); } }
  return <EditorModal title={`Modèles — ${position.title}`} onClose={onClose} wide><div className="stack"><div className="template-list">{position.templates.map(template => <div key={template.id} className="template-library-card"><div className="template-preview-mini"><span>A4</span><i /><i /><i /></div><div><strong>{template.name}</strong><span>{template.visualTheme} · {template.orientation} · V{template.currentVersion?.majorVersion || 1}.{template.currentVersion?.minorVersion || 0}</span>{canManage && <select className="template-workflow-select" value={template.workflowId || ""} onChange={event => setWorkflow(template.id, event.target.value)}><option value="">Sans circuit</option>{workflows.data.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select>}</div><StatusBadge value={template.currentVersion?.status || "DRAFT"} /><div className="row-actions"><Link className="btn btn-ghost" to={`/job-descriptions/templates/${template.id}/builder`}>{template.currentVersion?.status === "DRAFT" ? "Ouvrir le Builder" : "Consulter"}</Link>{canValidate && template.currentVersion?.status === "DRAFT" && <Button variant="primary" onClick={() => validate(template.id)}><Check size={15} /> Valider</Button>}</div></div>)}{!position.templates.length && <div className="empty-state">Aucun modèle pour ce poste.</div>}</div>{canManage && (creating ? <form className="template-create-form workflow-enabled" onSubmit={create}><Field label="Nom du modèle"><input autoFocus required value={name} onChange={event => setName(event.target.value)} placeholder={`Fiche standard — ${position.title}`} /></Field><Field label="Style"><select value={theme} onChange={event => setTheme(event.target.value)}><option value="corporate">Corporate</option><option value="compact">Compact</option><option value="modern">Moderne</option><option value="iso">Qualité / ISO</option></select></Field><Field label="Orientation"><select value={orientation} onChange={event => setOrientation(event.target.value)}><option value="portrait">Portrait</option><option value="landscape">Paysage</option></select></Field><Field label="Circuit"><select value={workflowId} onChange={event => setWorkflowId(event.target.value)}><option value="">Sans circuit</option>{workflows.data.map(workflow => <option key={workflow.id} value={workflow.id}>{workflow.name}</option>)}</select></Field><div className="row-actions"><Button type="button" variant="ghost" onClick={() => setCreating(false)}>Annuler</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Création..." : "Créer le brouillon"}</Button></div></form> : <Button variant="secondary" onClick={() => setCreating(true)}><Plus size={16} /> Nouveau modèle vide</Button>)}</div></EditorModal>;
}

function MissionsTab({ rows, companies, loading, canManage, onSuccess, onError }: { rows: MissionLibraryItem[]; companies: JobCompany[]; loading: boolean; canManage: boolean; onSuccess: (text: string) => void; onError: (error: unknown) => void }) {
  const [search, setSearch] = useState(""); const [category, setCategory] = useState(""); const [editor, setEditor] = useState<MissionLibraryItem | "new" | null>(null); const [form, setForm] = useState(emptyMission); const [saving, setSaving] = useState(false);
  const categories = useMemo(() => [...new Set(rows.map(row => row.category))].sort(), [rows]);
  const filtered = useMemo(() => rows.filter(row => (!category || row.category === category) && (!search.trim() || `${row.label} ${row.description || ""} ${row.code || ""}`.toLowerCase().includes(search.trim().toLowerCase()))), [rows, category, search]);
  function open(row?: MissionLibraryItem) { setEditor(row || "new"); setForm(row ? { companyId: row.companyId || "", category: row.category, code: row.code || "", label: row.label, description: row.description || "", taskType: row.taskType || "", frequency: row.frequency || "", priority: row.priority ? String(row.priority) : "", essential: row.essential } : emptyMission); }
  async function save(event: FormEvent) { event.preventDefault(); setSaving(true); try { const isNew = editor === "new"; await api(isNew ? "/api/job-descriptions/missions" : `/api/job-descriptions/missions/${(editor as MissionLibraryItem).id}`, { method: isNew ? "POST" : "PATCH", body: JSON.stringify({ ...form, companyId: form.companyId || undefined, priority: form.priority ? Number(form.priority) : undefined }) }); setEditor(null); onSuccess(isNew ? "Mission ajoutée à la bibliothèque." : "Mission mise à jour."); } catch (reason) { onError(reason); } finally { setSaving(false); } }
  return <div className="stack"><div className="library-toolbar"><div className="input-icon library-search"><Search size={15} /><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Rechercher une mission..." /></div><select value={category} onChange={event => setCategory(event.target.value)}><option value="">Toutes les catégories</option>{categories.map(value => <option key={value}>{value}</option>)}</select>{canManage && <Button variant="primary" onClick={() => open()}><Plus size={16} /> Nouvelle mission</Button>}</div><DataTable rows={filtered} loading={loading} pageSize={25} empty="Aucune mission dans la bibliothèque." columns={[
    { key: "mission", header: "Mission", render: row => <div className="job-title-cell"><strong>{row.label}</strong><span>{row.description || "Sans description"}</span></div>, sortValue: row => row.label },
    { key: "category", header: "Catégorie", render: row => <span className="mission-category-chip">{row.category}</span>, sortValue: row => row.category },
    { key: "scope", header: "Société", render: row => row.company?.shortName || <span className="scope-chip">Commune</span> },
    { key: "frequency", header: "Fréquence", render: row => frequencyLabel(row.frequency) },
    { key: "priority", header: "Priorité", render: row => row.priority ? <span className="priority-dot">P{row.priority}</span> : "-", sortValue: row => row.priority || 0 },
    { key: "essential", header: "Essentielle", render: row => row.essential ? <span className="essential-chip"><Check size={13} /> Oui</span> : "Non" },
    { key: "status", header: "Statut", render: row => <StatusBadge value={row.isActive ? "ACTIVE" : "ARCHIVED"} label={row.isActive ? "Active" : "Inactive"} /> },
    { key: "actions", header: "Actions", render: row => canManage ? <Button variant="ghost" onClick={() => open(row)}><Pencil size={14} /> Modifier</Button> : "-" }
  ]} />{editor && <EditorModal title={editor === "new" ? "Nouvelle mission" : "Modifier la mission"} onClose={() => setEditor(null)}><form className="job-editor-form" onSubmit={save}><div className="job-form-grid"><Field label="Société"><select value={form.companyId} onChange={event => setForm({ ...form, companyId: event.target.value })}><option value="">Mission commune</option>{companies.filter(row => row.isActive).map(row => <option key={row.id} value={row.id}>{row.shortName}</option>)}</select></Field><Field label="Catégorie"><input list="mission-categories" required value={form.category} onChange={event => setForm({ ...form, category: event.target.value })} /><datalist id="mission-categories">{categories.map(value => <option key={value} value={value} />)}</datalist></Field><Field label="Code"><input value={form.code} onChange={event => setForm({ ...form, code: event.target.value.toUpperCase() })} /></Field><Field label="Type"><input value={form.taskType} onChange={event => setForm({ ...form, taskType: event.target.value })} /></Field><Field label="Fréquence"><select value={form.frequency} onChange={event => setForm({ ...form, frequency: event.target.value })}><option value="">Non définie</option><option value="DAILY">Quotidienne</option><option value="WEEKLY">Hebdomadaire</option><option value="MONTHLY">Mensuelle</option><option value="QUARTERLY">Trimestrielle</option><option value="YEARLY">Annuelle</option><option value="OCCASIONAL">Ponctuelle</option><option value="AS_NEEDED">Selon besoin</option></select></Field><Field label="Priorité (1 à 10)"><input type="number" min="1" max="10" value={form.priority} onChange={event => setForm({ ...form, priority: event.target.value })} /></Field></div><Field label="Libellé"><input required value={form.label} onChange={event => setForm({ ...form, label: event.target.value })} /></Field><Field label="Description"><textarea rows={4} value={form.description} onChange={event => setForm({ ...form, description: event.target.value })} /></Field><label className="job-check-field"><input type="checkbox" checked={form.essential} onChange={event => setForm({ ...form, essential: event.target.checked })} /><span><strong>Mission essentielle</strong><small>Cette mission participe à la finalité principale du poste.</small></span></label><EditorActions saving={saving} onCancel={() => setEditor(null)} /></form></EditorModal>}</div>;
}

function EditorModal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) { return <div className="modal-backdrop"><div className={`modal job-library-modal ${wide ? "wide" : ""}`}><div className="modal-header"><div><span>Bibliothèque des fiches de poste</span><h2>{title}</h2></div><button className="modal-close" onClick={onClose} aria-label="Fermer"><X size={18} /></button></div><div className="modal-content">{children}</div></div></div>; }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="filter-field"><span>{label}</span>{children}</label>; }
function EditorActions({ saving, onCancel }: { saving: boolean; onCancel: () => void }) { return <div className="job-editor-actions"><Button type="button" variant="ghost" onClick={onCancel}>Annuler</Button><Button type="submit" variant="primary" disabled={saving}>{saving ? "Enregistrement..." : "Enregistrer"}</Button></div>; }
function blankBuilder(theme: string, orientation: string) { return { schemaVersion: 1, page: { format: "A4", orientation, visualTheme: theme }, blocks: [] }; }
function frequencyLabel(value: string | null) { return ({ DAILY: "Quotidienne", WEEKLY: "Hebdomadaire", MONTHLY: "Mensuelle", QUARTERLY: "Trimestrielle", YEARLY: "Annuelle", OCCASIONAL: "Ponctuelle", AS_NEEDED: "Selon besoin" } as Record<string, string>)[value || ""] || "-"; }
function cleanApiError(value: string) { try { const parsed = JSON.parse(value); return Array.isArray(parsed.message) ? parsed.message.join(" · ") : parsed.message || value; } catch { return value; } }
