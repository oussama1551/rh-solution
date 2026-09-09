import { ChevronLeft, ChevronRight, Search, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { useApi, useSessionFilters } from "../lib/useApi";

type AuditItem = { id: string; action: string; entityType: string; entityId: string | null; ipAddress: string | null; userAgent: string | null; before: unknown; after: unknown; metadata: unknown; createdAt: string; user: { id: string; username: string; fullName: string } | null };
type AuditResult = { items: AuditItem[]; total: number; page: number; limit: number };

export function AuditLogsPage() {
  const { filters, update, reset } = useSessionFilters("admin.audit.filters", { search: "", action: "", entityType: "", from: "", to: "", page: "1" });
  const params = useMemo(() => { const value = new URLSearchParams({ limit: "50" }); Object.entries(filters).forEach(([key, item]) => item && value.set(key, item)); return value; }, [filters]);
  const logs = useApi<AuditResult>(`/api/audit-log?${params}`, { items: [], total: 0, page: 1, limit: 50 });
  const [detail, setDetail] = useState<AuditItem | null>(null);
  const pages = Math.max(1, Math.ceil(logs.data.total / logs.data.limit));
  const change = (values: Record<string, string>) => update({ ...values, page: "1" });
  return <><PageHeader title="Historique des activités" /><section className="panel audit-page">
    <p className="audit-help">Cette page indique simplement qui a fait quoi et quand. Les informations techniques restent disponibles dans « Voir détails ».</p>
    <FiltersBar onReset={reset}><FilterField label="Recherche"><div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => change({ search: event.target.value })} placeholder="Nom, opération ou module..." /></div></FilterField><FilterField label="Opération"><input value={filters.action} onChange={event => change({ action: event.target.value })} placeholder="Création, validation..." /></FilterField><FilterField label="Élément"><input value={filters.entityType} onChange={event => change({ entityType: event.target.value })} placeholder="Employé, absence..." /></FilterField><FilterField label="Du"><input type="date" value={filters.from} onChange={event => change({ from: event.target.value })} /></FilterField><FilterField label="Au"><input type="date" value={filters.to} onChange={event => change({ to: event.target.value })} /></FilterField></FiltersBar>
    <div className="audit-summary"><span><b>{logs.data.total}</b> activité(s)</span><span>Page {logs.data.page}/{pages}</span></div>
    {logs.loading ? <LoadingState label="Chargement de l'historique..." /> : <div className="audit-table-wrap"><table className="audit-table"><thead><tr><th>Date et heure</th><th>Effectué par</th><th>Activité</th><th>Élément concerné</th><th>Détails</th></tr></thead><tbody>{logs.data.items.map(item => <tr key={item.id}><td>{new Date(item.createdAt).toLocaleString("fr-FR")}</td><td><strong>{actorName(item)}</strong>{item.user?.username && <small>{item.user.username}</small>}</td><td><div className="audit-friendly"><strong>{friendlyAction(item.action)}</strong><small>{actorName(item)} — {friendlyEntity(item.entityType).toLowerCase()}</small></div></td><td><span className="audit-entity">{friendlyEntity(item.entityType)}</span></td><td><Button variant="ghost" onClick={() => setDetail(item)}>Voir détails</Button></td></tr>)}</tbody></table>{!logs.data.items.length && <div className="empty-state">Aucune activité ne correspond aux filtres.</div>}</div>}
    <div className="pagination no-print"><Button variant="secondary" disabled={logs.data.page <= 1} onClick={() => update({ page: String(logs.data.page - 1) })}><ChevronLeft size={15} /> Précédent</Button><span>{logs.data.page} / {pages}</span><Button variant="secondary" disabled={logs.data.page >= pages} onClick={() => update({ page: String(logs.data.page + 1) })}>Suivant <ChevronRight size={15} /></Button></div>
  </section>{detail && <div className="modal-backdrop"><div className="calendar-modal audit-detail-modal"><div className="modal-header"><div><span>Détails techniques</span><strong>{friendlyAction(detail.action)}</strong><small>{new Date(detail.createdAt).toLocaleString("fr-FR")} · {detail.action}</small></div><button className="icon-button" onClick={() => setDetail(null)}><X size={18} /></button></div><div className="audit-technical-summary"><span><b>Utilisateur :</b> {actorName(detail)}</span><span><b>Élément :</b> {friendlyEntity(detail.entityType)}</span><span><b>Identifiant :</b> {detail.entityId || "-"}</span><span><b>Adresse IP :</b> {detail.ipAddress || "-"}</span></div><AuditJson label="Valeurs avant l'opération" value={detail.before} /><AuditJson label="Valeurs après l'opération" value={detail.after} /><AuditJson label="Informations complémentaires" value={detail.metadata} />{detail.userAgent && <div className="audit-agent"><b>Navigateur</b><span>{detail.userAgent}</span></div>}</div></div>}</>;
}

const actions: Record<string, string> = { create: "Création", update: "Modification", delete: "Suppression", approve: "Validation", reject: "Rejet", confirm: "Confirmation", restore: "Restauration", login: "Connexion", logout: "Déconnexion", sync: "Synchronisation", import: "Importation", export: "Exportation" };
const entities: Record<string, string> = { employee: "Employé", overtime: "Heures supplémentaires", sick: "Maladie", leave: "Congé", presumed_absence: "Vérification de présence", user: "Compte utilisateur", group: "Groupe d'employés", shift: "Planning / shift", payroll: "Paie" };
function friendlyAction(action: string) { const word = action.toLowerCase().split(/[._-]/).reverse().find(item => actions[item]); return word ? actions[word] : "Mise à jour du système"; }
function friendlyEntity(entity: string) { const value = entity.toLowerCase(), key = Object.keys(entities).find(item => value.includes(item)); return key ? entities[key] : entity.replace(/_/g, " "); }
function actorName(item: AuditItem) { return item.user?.fullName || item.user?.username || "Système automatique"; }
function AuditJson({ label, value }: { label: string; value: unknown }) { if (value === null || value === undefined) return null; return <div className="audit-json"><strong>{label}</strong><pre>{JSON.stringify(value, null, 2)}</pre></div>; }
