import { JobPosition } from "../lib/types";
import { fileUrl } from "../lib/api";

type PreviewBlock = { id: string; type: string; title: string; visible: boolean; pageBreakBefore: boolean; content: any };
type PreviewDocument = { page: { orientation: "portrait" | "landscape"; visualTheme: string }; blocks: PreviewBlock[] };
type VariableDefinition = { code: string; sample: string };

export function JobDescriptionA4Preview({ document, position, templateName, variables, zoom }: { document: PreviewDocument; position: JobPosition; templateName: string; variables: VariableDefinition[]; zoom: number }) {
  const sample = Object.fromEntries(variables.map(variable => [variable.code, variable.sample]));
  const visible = document.blocks.filter(block => block.visible);
  return <div className="job-preview-viewport"><div className={`job-a4-document theme-${document.page.visualTheme} ${document.page.orientation}`} style={{ transform: `scale(${zoom})`, transformOrigin: "top center", marginBottom: `${Math.max(0, (zoom - 1) * 1120)}px` }}>
    <header className="job-a4-header"><div className="job-a4-logo">{position.company?.brandings?.length ? <img src={fileUrl(`/api/job-descriptions/companies/${position.company.id}/logo`, new URLSearchParams())} alt={`Logo ${position.company.shortName}`} /> : position.company?.shortName?.slice(0, 3).toUpperCase() || "LOGO"}</div><div className="job-a4-title"><strong>FICHE DE POSTE</strong><span>{resolveText(templateName, sample)}</span></div><table><tbody><tr><th>Référence</th><td>{sample["document.reference"] || "FP-..."}</td></tr><tr><th>Version</th><td>{sample["document.version"] || "V1.0"}</td></tr><tr><th>Date d'effet</th><td>{sample["document.effective_date"] || "-"}</td></tr></tbody></table></header>
    <section className="job-a4-identity"><div><span>Matricule</span><strong>{sample["employee.matricule"]}</strong></div><div><span>Nom et prénom</span><strong>{sample["employee.full_name"]}</strong></div><div><span>Poste</span><strong>{position.title || sample["job.title"]}</strong></div><div><span>Direction</span><strong>{position.direction || "-"}</strong></div><div><span>Département</span><strong>{position.department || sample["employee.department"]}</strong></div><div><span>Service</span><strong>{position.service || "-"}</strong></div><div><span>Responsable hiérarchique</span><strong>{position.hierarchicalReporting || sample["manager.full_name"]}</strong></div><div><span>Société</span><strong>{position.company?.shortName || sample["company.name"]}</strong></div></section>
    <div className="job-a4-content">{visible.map(block => <PreviewBlockView key={block.id} block={block} sample={sample} />)}{!visible.length && <div className="job-a4-empty">Ajoutez des blocs dans le mode Édition pour construire le document.</div>}</div>
    <footer className="job-a4-footer"><span>{sample["document.reference"] || "Référence documentaire"}</span><span>{sample["document.version"] || "V1.0"}</span><span>Page 1 / 1</span></footer>
  </div></div>;
}

function PreviewBlockView({ block, sample }: { block: PreviewBlock; sample: Record<string, string> }) {
  const text = resolveText(String(block.content?.text || ""), sample);
  const items: any[] = Array.isArray(block.content?.items) ? block.content.items : [];
  if (["COMPANY_HEADER", "EMPLOYEE_IDENTITY", "JOB_IDENTITY"].includes(block.type)) return null;
  if (block.type === "SEPARATOR") return <hr className="job-a4-separator" />;
  if (block.type === "SIGNATURES") return <section className={`job-a4-section signature-section ${block.pageBreakBefore ? "page-break-before" : ""}`}><h2>{block.title}</h2><div className="signature-grid"><Signature title="Responsable hiérarchique" /><Signature title="Direction RH" /><Signature title="Direction Générale" /><Signature title="Pris connaissance par le titulaire" /></div></section>;
  if (block.type === "REVISION_HISTORY") return <section className="job-a4-section"><h2>{block.title}</h2><table className="job-a4-table"><thead><tr><th>Version</th><th>Date</th><th>Modification</th><th>Auteur</th></tr></thead><tbody><tr><td>V1.0</td><td>-</td><td>Création initiale</td><td>-</td></tr></tbody></table></section>;
  if (block.type === "TASKS") return <section className={`job-a4-section ${block.pageBreakBefore ? "page-break-before" : ""}`}><h2>{block.title}</h2><ol className="job-a4-tasks">{items.map(item => <li key={item.id}><div><strong>{resolveText(item.label || "", sample)}</strong>{item.description && <p>{resolveText(item.description, sample)}</p>}</div>{item.essential && <span>Essentielle</span>}</li>)}</ol>{!items.length && <p className="job-a4-placeholder">Aucune mission renseignée.</p>}</section>;
  if (block.type === "KPI") return <section className={`job-a4-section ${block.pageBreakBefore ? "page-break-before" : ""}`}><h2>{block.title}</h2><table className="job-a4-table"><thead><tr><th>Indicateur</th><th>Unité</th><th>Cible</th><th>Fréquence</th></tr></thead><tbody>{items.map(item => <tr key={item.id}><td>{resolveText(item.name || item.label || "", sample)}</td><td>{item.unit || "-"}</td><td>{item.target || "-"}</td><td>{item.frequency || "-"}</td></tr>)}</tbody></table>{!items.length && <p className="job-a4-placeholder">Aucun KPI renseigné.</p>}</section>;
  if (block.type === "CUSTOM_TABLE") return <section className={`job-a4-section ${block.pageBreakBefore ? "page-break-before" : ""}`}><h2>{block.title}</h2><table className="job-a4-table"><tbody><tr><td>{text || "Tableau à configurer"}</td></tr></tbody></table></section>;
  return <section className={`job-a4-section ${block.pageBreakBefore ? "page-break-before" : ""}`}><h2>{block.title}</h2><div className="job-a4-rich-text">{text ? text.split("\n").map((line, index) => <p key={index}>{line || <>&nbsp;</>}</p>) : <p className="job-a4-placeholder">Contenu à renseigner.</p>}</div></section>;
}

function Signature({ title }: { title: string }) { return <div><strong>{title}</strong><span>Nom :</span><span>Date :</span><span className="signature-space">Signature / Cachet</span></div>; }
function resolveText(text: string, values: Record<string, string>) { return text.replace(/\{\{\s*([a-z][a-z0-9_.]*)\s*\}\}/gi, (token, code: string) => values[code.toLowerCase()] || token); }
