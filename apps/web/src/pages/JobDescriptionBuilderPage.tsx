import {
  DndContext, DragEndEvent, DragOverlay, PointerSensor, useDraggable, useDroppable, useSensor, useSensors
} from "@dnd-kit/core";
import { arrayMove, SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronDown, ChevronUp, Copy, Eye, EyeOff, FileText, GripVertical, Library, Monitor, Pencil, Plus, Redo2, Save, Trash2, Undo2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Button } from "../components/Button";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { JobDescriptionA4Preview } from "../components/JobDescriptionA4Preview";
import { api } from "../lib/api";
import { JobPosition, JobTemplateVersion, MissionLibraryItem } from "../lib/types";
import { useApi } from "../lib/useApi";

type BuilderDocument = { schemaVersion: 1; page: { format: "A4"; orientation: "portrait" | "landscape"; visualTheme: string }; blocks: BuilderBlock[] };
type BuilderBlock = { id: string; type: string; order: number; title: string; visible: boolean; required: boolean; editable: boolean; removable: boolean; pageBreakBefore: boolean; style: Record<string, string | number | boolean>; content: any };
type BuilderTask = { id: string; sourceMissionId?: string; label: string; description?: string; essential?: boolean; frequency?: string; priority?: number; linkedKpiIds: string[] };
type TemplateDetail = { id: string; name: string; visualTheme: string; orientation: string; jobPosition: JobPosition; currentVersion: JobTemplateVersion | null };
type VariableDefinition = { code: string; label: string; group: string; type: "text" | "date" | "image"; sample: string };

const BLOCK_LIBRARY = [
  ["COMPANY_HEADER", "En-tête société", "Identité"], ["EMPLOYEE_IDENTITY", "Identification du salarié", "Identité"], ["JOB_IDENTITY", "Identification du poste", "Identité"],
  ["PURPOSE", "Mission / Finalité", "Contenu"], ["TASKS", "Missions principales", "Contenu"], ["RESPONSIBILITIES", "Responsabilités", "Contenu"], ["AUTHORITIES", "Autorités et décisions", "Contenu"], ["OBJECTIVES", "Objectifs", "Contenu"],
  ["HIERARCHY", "Rattachement hiérarchique", "Relations"], ["INTERNAL_RELATIONS", "Relations internes", "Relations"], ["EXTERNAL_RELATIONS", "Relations externes", "Relations"],
  ["KPI", "KPI / Indicateurs", "Performance"], ["TECHNICAL_SKILLS", "Compétences techniques", "Profil"], ["BEHAVIORAL_SKILLS", "Compétences comportementales", "Profil"], ["EDUCATION", "Formation requise", "Profil"], ["EXPERIENCE", "Expérience requise", "Profil"], ["CERTIFICATIONS", "Certifications", "Profil"],
  ["TOOLS", "Outils / ERP / logiciels", "Conditions"], ["EQUIPMENT", "Machines / équipements", "Conditions"], ["WORK_CONDITIONS", "Conditions de travail", "Conditions"], ["SCHEDULE", "Horaires particuliers", "Conditions"], ["TRAVEL", "Déplacements", "Conditions"], ["HSE_RISKS", "Risques HSE", "Conditions"], ["PPE", "EPI requis", "Conditions"],
  ["CONFIDENTIALITY", "Confidentialité", "Autres"], ["DELEGATION", "Délégation / remplacement", "Autres"], ["OBSERVATIONS", "Observations", "Autres"], ["SIGNATURES", "Validation / signatures", "Document"], ["REVISION_HISTORY", "Historique de révision", "Document"], ["FREE_TEXT", "Texte libre", "Document"], ["SEPARATOR", "Séparateur", "Document"], ["CUSTOM_TABLE", "Tableau personnalisable", "Document"]
] as const;

export function JobDescriptionBuilderPage() {
  const { id } = useParams();
  const location = useLocation();
  const employeeMode = location.pathname.includes("/documents/");
  const template = useApi<any>(id ? employeeMode ? `/api/job-descriptions/documents/${id}` : `/api/job-descriptions/templates/${id}` : null, null);
  const missions = useApi<MissionLibraryItem[]>("/api/job-descriptions/missions", []);
  const variables = useApi<VariableDefinition[]>("/api/job-descriptions/variable-catalog", []);
  const [document, setDocument] = useState<BuilderDocument | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [past, setPast] = useState<BuilderDocument[]>([]);
  const [future, setFuture] = useState<BuilderDocument[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [activeLabel, setActiveLabel] = useState<string | null>(null);
  const [missionPicker, setMissionPicker] = useState(false);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [zoomMode, setZoomMode] = useState<"fit" | "50" | "75" | "100">("fit");
  const initialized = useRef(false);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));
  const locked = template.data?.currentVersion?.status !== "DRAFT";

  useEffect(() => {
    if (!template.data?.currentVersion || initialized.current) return;
    initialized.current = true;
    setDocument(normalizeDocument(template.data.currentVersion.content, template.data.visualTheme || template.data.currentVersion.content?.page?.visualTheme, template.data.orientation || template.data.currentVersion.content?.page?.orientation));
  }, [template.data]);

  const apply = useCallback((next: BuilderDocument, track = true) => {
    setDocument(current => {
      if (track && current) setPast(rows => [...rows.slice(-39), clone(current)]);
      return normalizeOrders(next);
    });
    if (track) { setFuture([]); setDirty(true); setSaveState("idle"); }
  }, []);

  const save = useCallback(async () => {
    if (!id || !document || locked || !dirty) return;
    setSaveState("saving");
    try {
      await api(employeeMode ? `/api/job-descriptions/documents/${id}/draft` : `/api/job-descriptions/templates/${id}/draft`, { method: "PATCH", body: JSON.stringify({ content: document }) });
      setDirty(false); setSaveState("saved");
    } catch { setSaveState("error"); }
  }, [dirty, document, employeeMode, id, locked]);

  useEffect(() => { if (!dirty || locked) return; const timer = window.setTimeout(save, 1300); return () => window.clearTimeout(timer); }, [dirty, document, locked, save]);

  const selected = document?.blocks.find(block => block.id === selectedId) || null;
  function addBlock(type: string, index?: number) { if (!document || locked) return; const definition = BLOCK_LIBRARY.find(row => row[0] === type); const block = newBlock(type, definition?.[1] || "Bloc personnalisé"); const blocks = [...document.blocks]; blocks.splice(index ?? blocks.length, 0, block); apply({ ...document, blocks }); setSelectedId(block.id); }
  function updateBlock(id: string, patch: Partial<BuilderBlock>) { if (!document || locked) return; apply({ ...document, blocks: document.blocks.map(block => block.id === id ? { ...block, ...patch } : block) }); }
  function removeBlock(id: string) { if (!document || locked) return; const block = document.blocks.find(row => row.id === id); if (!block?.removable) return; apply({ ...document, blocks: document.blocks.filter(row => row.id !== id) }); if (selectedId === id) setSelectedId(null); }
  function duplicateBlock(block: BuilderBlock) { if (!document || locked) return; const index = document.blocks.findIndex(row => row.id === block.id); const copy = clone(block); copy.id = uid("block"); copy.title = `${copy.title} — copie`; if (Array.isArray(copy.content?.items)) copy.content.items = copy.content.items.map((task: BuilderTask) => ({ ...task, id: uid("task") })); const blocks = [...document.blocks]; blocks.splice(index + 1, 0, copy); apply({ ...document, blocks }); setSelectedId(copy.id); }
  function undo() { const previous = past[past.length - 1]; if (!document || !previous) return; setFuture(rows => [clone(document), ...rows].slice(0, 40)); setPast(rows => rows.slice(0, -1)); setDocument(clone(previous)); setDirty(true); }
  function redo() { const next = future[0]; if (!document || !next) return; setPast(rows => [...rows, clone(document)].slice(-40)); setFuture(rows => rows.slice(1)); setDocument(clone(next)); setDirty(true); }

  function dragEnd(event: DragEndEvent) {
    setActiveLabel(null);
    if (!document || locked || !event.over) return;
    const kind = event.active.data.current?.kind;
    if (kind === "palette") { const overIndex = document.blocks.findIndex(block => block.id === event.over?.id); addBlock(String(event.active.data.current?.blockType), overIndex < 0 ? undefined : overIndex); return; }
    if (kind === "task") {
      const blockId = String(event.active.data.current?.blockId); const block = document.blocks.find(row => row.id === blockId); if (!block || !Array.isArray(block.content?.items)) return;
      const oldIndex = block.content.items.findIndex((task: BuilderTask) => task.id === event.active.id); const newIndex = block.content.items.findIndex((task: BuilderTask) => task.id === event.over?.id); if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) updateBlock(blockId, { content: { ...block.content, items: arrayMove(block.content.items, oldIndex, newIndex) } }); return;
    }
    const oldIndex = document.blocks.findIndex(block => block.id === event.active.id); const newIndex = document.blocks.findIndex(block => block.id === event.over?.id); if (oldIndex >= 0 && newIndex >= 0 && oldIndex !== newIndex) apply({ ...document, blocks: arrayMove(document.blocks, oldIndex, newIndex) });
  }

  if (template.loading || !document) return <LoadingState label="Chargement du Builder..." />;
  if (!template.data) return <div className="alert alert-error">Template introuvable.</div>;
  const position = template.data.jobPosition || ({ id: "snapshot", code: template.data.currentVersion.jobSnapshot?.selected?.jobCode || "-", title: template.data.currentVersion.jobSnapshot?.selected?.jobTitle || "Poste personnalisé", companyId: template.data.company?.id || null, company: template.data.company || null, direction: null, department: template.data.currentVersion.employeeSnapshot?.department || null, service: null, hierarchicalReporting: template.data.currentVersion.employeeSnapshot?.manager?.fullName || null, functionalReporting: null, isActive: true, aliases: [], templates: [] } as JobPosition);
  const builderName = employeeMode ? `${template.data.reference} — ${template.data.employee?.fullName}` : template.data.name;
  if (employeeMode) { template.data.name = builderName; template.data.jobPosition = position; }

  return <>
    <PageHeader title={`Builder — ${template.data.name}`} backTo="/job-descriptions" backLabel="Bibliothèque" actions={<div className="builder-header-actions"><div className="builder-mode-switch"><button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}><Pencil size={14} /> Édition</button><button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}><Monitor size={14} /> Aperçu A4</button></div><StatusBadge value={template.data.currentVersion?.status || "DRAFT"} />{mode === "edit" && <><Button variant="ghost" disabled={!past.length || locked} onClick={undo}><Undo2 size={15} /> Annuler</Button><Button variant="ghost" disabled={!future.length || locked} onClick={redo}><Redo2 size={15} /> Rétablir</Button><Button variant="primary" disabled={!dirty || locked || saveState === "saving"} onClick={save}><Save size={15} /> {saveState === "saving" ? "Sauvegarde..." : "Sauvegarder"}</Button></>}</div>} />
    {locked && <div className="alert">Cette version est validée : consultation uniquement. Une révision sera nécessaire pour la modifier.</div>}
    <div className="builder-status-line"><span>{template.data.jobPosition.code} · {template.data.jobPosition.title}</span><span className={`autosave-state ${saveState}`}>{saveState === "saving" ? "Sauvegarde automatique..." : saveState === "saved" ? "Brouillon enregistré" : saveState === "error" ? "Échec de sauvegarde" : dirty ? "Modifications locales" : "À jour"}</span></div>
    {mode === "preview" ? <section className="job-preview-mode"><div className="job-preview-toolbar"><div><FileText size={16} /><strong>Aperçu du document officiel</strong><span>Les valeurs affichées sont des exemples du registre RH.</span></div><label>Zoom<select value={zoomMode} onChange={event => setZoomMode(event.target.value as typeof zoomMode)}><option value="fit">Ajuster à la page</option><option value="50">50 %</option><option value="75">75 %</option><option value="100">100 %</option></select></label></div><JobDescriptionA4Preview document={document} position={template.data.jobPosition} templateName={template.data.name} variables={variables.data} zoom={zoomValue(zoomMode, document.page.orientation)} /></section> : <DndContext sensors={sensors} onDragStart={event => setActiveLabel(String(event.active.data.current?.label || "Déplacer"))} onDragEnd={dragEnd} onDragCancel={() => setActiveLabel(null)}>
      <main className="job-builder-layout">
        <aside className="builder-palette"><div className="builder-pane-title"><strong>Blocs</strong><span>Glissez ou cliquez pour ajouter</span></div>{[...new Set(BLOCK_LIBRARY.map(row => row[2]))].map(category => <section key={category}><h3>{category}</h3>{BLOCK_LIBRARY.filter(row => row[2] === category).map(row => <PaletteItem key={row[0]} type={row[0]} label={row[1]} disabled={locked} onAdd={() => addBlock(row[0])} />)}</section>)}</aside>
        <BuilderCanvas document={document} selectedId={selectedId} collapsed={collapsed} locked={locked} onSelect={setSelectedId} onCollapse={id => setCollapsed(current => { const next = new Set(current); next.has(id) ? next.delete(id) : next.add(id); return next; })} onUpdate={updateBlock} onDuplicate={duplicateBlock} onRemove={removeBlock} onOpenMissions={() => setMissionPicker(true)} />
        <PropertiesPanel block={selected} document={document} variables={variables.data} locked={locked} onUpdate={patch => selected && updateBlock(selected.id, patch)} onPageChange={page => apply({ ...document, page })} />
      </main>
      <DragOverlay>{activeLabel && <div className="builder-drag-overlay"><GripVertical size={14} /> {activeLabel}</div>}</DragOverlay>
    </DndContext>}
    {missionPicker && <MissionPicker missions={missions.data} onClose={() => setMissionPicker(false)} onInsert={selectedMissions => { if (!document) return; const existingTarget = document.blocks.find(block => block.type === "TASKS"); const target = existingTarget || newBlock("TASKS", "Missions principales"); const baseBlocks = existingTarget ? document.blocks : [...document.blocks, target]; const existing = Array.isArray(target.content?.items) ? target.content.items : []; const items = [...existing, ...selectedMissions.map(mission => ({ id: uid("task"), sourceMissionId: mission.id, label: mission.label, description: mission.description || "", essential: mission.essential, frequency: mission.frequency || undefined, priority: mission.priority || undefined, linkedKpiIds: [] }))]; apply({ ...document, blocks: baseBlocks.map(block => block.id === target.id ? { ...block, content: { ...block.content, items } } : block) }); setSelectedId(target.id); setMissionPicker(false); }} />}
  </>;
}

function BuilderCanvas({ document, selectedId, collapsed, locked, onSelect, onCollapse, onUpdate, onDuplicate, onRemove, onOpenMissions }: { document: BuilderDocument; selectedId: string | null; collapsed: Set<string>; locked: boolean; onSelect: (id: string) => void; onCollapse: (id: string) => void; onUpdate: (id: string, patch: Partial<BuilderBlock>) => void; onDuplicate: (block: BuilderBlock) => void; onRemove: (id: string) => void; onOpenMissions: () => void }) {
  const drop = useDroppable({ id: "canvas-drop" });
  return <section className="builder-workspace"><div className="builder-canvas-toolbar"><span>Aperçu structurel A4 · {document.page.orientation === "portrait" ? "Portrait" : "Paysage"}</span><span>{document.blocks.length} bloc(s)</span></div><div ref={drop.setNodeRef} className={`builder-a4-canvas ${document.page.orientation} ${drop.isOver ? "is-drop-target" : ""}`}><SortableContext items={document.blocks.map(block => block.id)} strategy={verticalListSortingStrategy}>{document.blocks.map(block => <SortableBlock key={block.id} block={block} selected={block.id === selectedId} collapsed={collapsed.has(block.id)} locked={locked} onSelect={onSelect} onCollapse={onCollapse} onUpdate={onUpdate} onDuplicate={onDuplicate} onRemove={onRemove} onOpenMissions={onOpenMissions} />)}</SortableContext>{!document.blocks.length && <div className="builder-empty-canvas"><Plus size={30} /><strong>Commencez votre modèle</strong><span>Glissez un bloc depuis la bibliothèque de gauche.</span></div>}</div></section>;
}

function SortableBlock({ block, selected, collapsed, locked, onSelect, onCollapse, onUpdate, onDuplicate, onRemove, onOpenMissions }: any) {
  const sortable = useSortable({ id: block.id, data: { kind: "block", label: block.title }, disabled: locked });
  const style = { transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition };
  const tasks: BuilderTask[] = Array.isArray(block.content?.items) ? block.content.items : [];
  return <article ref={sortable.setNodeRef} style={style} className={`builder-block ${selected ? "selected" : ""} ${!block.visible ? "hidden-block" : ""}`} onClick={() => onSelect(block.id)}><header><button className="builder-grip" {...sortable.attributes} {...sortable.listeners} disabled={locked}><GripVertical size={16} /></button><div><strong>{block.title}</strong><span>{block.type}</span></div><div className="builder-block-actions"><button onClick={event => { event.stopPropagation(); onUpdate(block.id, { visible: !block.visible }); }}>{block.visible ? <Eye size={14} /> : <EyeOff size={14} />}</button><button onClick={event => { event.stopPropagation(); onCollapse(block.id); }}>{collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}</button>{!locked && <><button onClick={event => { event.stopPropagation(); onDuplicate(block); }}><Copy size={14} /></button><button disabled={!block.removable} onClick={event => { event.stopPropagation(); onRemove(block.id); }}><Trash2 size={14} /></button></>}</div></header>{!collapsed && <div className="builder-block-body">{block.type === "TASKS" ? <><div className="task-block-toolbar"><span>{tasks.length} mission(s)</span>{!locked && <Button variant="ghost" onClick={event => { event.stopPropagation(); onOpenMissions(); }}><Library size={14} /> Bibliothèque</Button>}</div><SortableContext items={tasks.map(task => task.id)} strategy={verticalListSortingStrategy}>{tasks.map(task => <SortableTask key={task.id} task={task} blockId={block.id} locked={locked} onChange={(patch: Partial<BuilderTask>) => onUpdate(block.id, { content: { ...block.content, items: tasks.map(row => row.id === task.id ? { ...row, ...patch } : row) } })} onDelete={() => onUpdate(block.id, { content: { ...block.content, items: tasks.filter(row => row.id !== task.id) } })} />)}</SortableContext>{!tasks.length && <span className="builder-placeholder">Ajoutez des missions depuis la bibliothèque.</span>}</> : block.type === "SEPARATOR" ? <hr /> : <textarea disabled={locked || !block.editable} value={String(block.content?.text || "")} onChange={event => onUpdate(block.id, { content: { ...block.content, text: event.target.value } })} placeholder="Saisissez le contenu de ce bloc..." />}</div>}</article>;
}

function SortableTask({ task, blockId, locked, onChange, onDelete }: { task: BuilderTask; blockId: string; locked: boolean; onChange: (patch: Partial<BuilderTask>) => void; onDelete: () => void }) { const sortable = useSortable({ id: task.id, data: { kind: "task", blockId, label: task.label }, disabled: locked }); return <div ref={sortable.setNodeRef} style={{ transform: CSS.Transform.toString(sortable.transform), transition: sortable.transition }} className="builder-task" onClick={event => event.stopPropagation()}><button className="builder-grip" {...sortable.attributes} {...sortable.listeners}><GripVertical size={14} /></button><div><input disabled={locked} value={task.label} onChange={event => onChange({ label: event.target.value })} /><textarea disabled={locked} rows={2} value={task.description || ""} onChange={event => onChange({ description: event.target.value })} /></div>{task.essential && <span className="essential-chip">Essentielle</span>}{!locked && <button className="task-delete" onClick={onDelete}><X size={14} /></button>}</div>; }

function PropertiesPanel({ block, document, variables, locked, onUpdate, onPageChange }: { block: BuilderBlock | null; document: BuilderDocument; variables: VariableDefinition[]; locked: boolean; onUpdate: (patch: Partial<BuilderBlock>) => void; onPageChange: (page: BuilderDocument["page"]) => void }) { const [variableGroup, setVariableGroup] = useState("employee"); const grouped = variables.filter(variable => variable.group === variableGroup); return <aside className="builder-properties"><div className="builder-pane-title"><strong>Propriétés</strong><span>{block ? block.type : "Document"}</span></div>{block ? <div className="properties-form"><label><span>Titre du bloc</span><input disabled={locked} value={block.title} onChange={event => onUpdate({ title: event.target.value })} /></label><PropertyCheck label="Visible" checked={block.visible} disabled={locked} onChange={visible => onUpdate({ visible })} /><PropertyCheck label="Obligatoire" checked={block.required} disabled={locked} onChange={required => onUpdate({ required })} /><PropertyCheck label="Éditable dans la fiche" checked={block.editable} disabled={locked} onChange={editable => onUpdate({ editable })} /><PropertyCheck label="Suppression autorisée" checked={block.removable} disabled={locked} onChange={removable => onUpdate({ removable })} /><PropertyCheck label="Nouvelle page avant" checked={block.pageBreakBefore} disabled={locked} onChange={pageBreakBefore => onUpdate({ pageBreakBefore })} />{!locked && !["TASKS", "KPI", "SEPARATOR"].includes(block.type) && <div className="variable-inserter"><strong>Variables dynamiques</strong><select value={variableGroup} onChange={event => setVariableGroup(event.target.value)}><option value="employee">Employé</option><option value="job">Poste</option><option value="company">Société</option><option value="document">Document</option><option value="manager">Responsable</option></select><div>{grouped.map(variable => <button key={variable.code} title={`Exemple : ${variable.sample}`} onClick={() => onUpdate({ content: { ...block.content, text: `${String(block.content?.text || "")}${block.content?.text ? " " : ""}{{${variable.code}}}` } })}>{variable.label}<code>{`{{${variable.code}}}`}</code></button>)}</div></div>}</div> : <div className="properties-form"><label><span>Style visuel</span><select disabled={locked} value={document.page.visualTheme} onChange={event => onPageChange({ ...document.page, visualTheme: event.target.value })}><option value="corporate">Corporate</option><option value="compact">Compact</option><option value="modern">Moderne</option><option value="iso">Qualité / ISO</option></select></label><label><span>Orientation</span><select disabled={locked} value={document.page.orientation} onChange={event => onPageChange({ ...document.page, orientation: event.target.value as "portrait" | "landscape" })}><option value="portrait">Portrait</option><option value="landscape">Paysage</option></select></label><div className="builder-help">Cliquez sur un bloc du canvas pour modifier ses propriétés.</div></div>}</aside>; }

function PaletteItem({ type, label, disabled, onAdd }: { type: string; label: string; disabled: boolean; onAdd: () => void }) { const drag = useDraggable({ id: `palette:${type}`, data: { kind: "palette", blockType: type, label }, disabled }); return <button ref={drag.setNodeRef} className="palette-item" style={{ transform: CSS.Translate.toString(drag.transform) }} {...drag.listeners} {...drag.attributes} disabled={disabled} onClick={onAdd}><GripVertical size={13} /><span>{label}</span><Plus size={13} /></button>; }
function PropertyCheck({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange: (value: boolean) => void }) { return <label className="property-check"><input type="checkbox" disabled={disabled} checked={checked} onChange={event => onChange(event.target.checked)} /><span>{label}</span></label>; }

function MissionPicker({ missions, onClose, onInsert }: { missions: MissionLibraryItem[]; onClose: () => void; onInsert: (missions: MissionLibraryItem[]) => void }) { const [search, setSearch] = useState(""); const [selected, setSelected] = useState<Set<string>>(new Set()); const filtered = missions.filter(row => !search.trim() || `${row.label} ${row.category} ${row.description || ""}`.toLowerCase().includes(search.toLowerCase())); return <div className="modal-backdrop"><div className="modal mission-picker-modal"><div className="modal-header"><div><span>Bibliothèque</span><h2>Ajouter des missions</h2></div><button className="modal-close" onClick={onClose}><X size={18} /></button></div><div className="modal-content"><div className="input-icon"><SearchIcon /><input autoFocus value={search} onChange={event => setSearch(event.target.value)} placeholder="Mission, catégorie..." /></div><div className="mission-picker-list">{filtered.map(mission => <label key={mission.id}><input type="checkbox" checked={selected.has(mission.id)} onChange={() => setSelected(current => { const next = new Set(current); next.has(mission.id) ? next.delete(mission.id) : next.add(mission.id); return next; })} /><span><strong>{mission.label}</strong><small>{mission.category} · {mission.description || "Sans description"}</small></span>{mission.essential && <i>Essentielle</i>}</label>)}</div><div className="job-editor-actions"><Button variant="ghost" onClick={onClose}>Annuler</Button><Button variant="primary" disabled={!selected.size} onClick={() => onInsert(missions.filter(row => selected.has(row.id)))}>Ajouter {selected.size || ""} mission(s)</Button></div></div></div></div>; }
function SearchIcon() { return <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>; }
function newBlock(type: string, title: string): BuilderBlock { return { id: uid("block"), type, order: 0, title, visible: true, required: ["COMPANY_HEADER", "EMPLOYEE_IDENTITY", "JOB_IDENTITY", "PURPOSE"].includes(type), editable: !["COMPANY_HEADER", "EMPLOYEE_IDENTITY", "JOB_IDENTITY", "REVISION_HISTORY"].includes(type), removable: !["COMPANY_HEADER", "EMPLOYEE_IDENTITY", "JOB_IDENTITY"].includes(type), pageBreakBefore: false, style: {}, content: type === "TASKS" || type === "KPI" ? { items: [] } : { text: "" } }; }
function normalizeDocument(raw: Record<string, unknown>, theme: string, orientation: string): BuilderDocument { const source = raw as unknown as BuilderDocument; return normalizeOrders({ schemaVersion: 1, page: { format: "A4", orientation: source.page?.orientation === "landscape" ? "landscape" : orientation === "landscape" ? "landscape" : "portrait", visualTheme: source.page?.visualTheme || theme || "corporate" }, blocks: Array.isArray(source.blocks) ? source.blocks.map(block => ({ ...newBlock(block.type, block.title), ...block, content: block.content || {} })) : [] }); }
function normalizeOrders(document: BuilderDocument) { return { ...document, blocks: document.blocks.map((block, order) => ({ ...block, order })) }; }
function uid(prefix: string) { return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)); }
function zoomValue(mode: "fit" | "50" | "75" | "100", orientation: "portrait" | "landscape") { if (mode === "50") return .5; if (mode === "75") return .75; if (mode === "100") return 1; const available = Math.max(500, window.innerWidth - 250); return Math.min(1, available / (orientation === "landscape" ? 1123 : 794)); }
