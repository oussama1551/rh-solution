import { ChevronLeft, ChevronRight, Clock, Printer, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { EmployeeMonthlyCalendarModal } from "../components/EmployeeMonthlyCalendarModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useApi, useSessionFilters } from "../lib/useApi";

type OvertimeDay = { date: string; rate50: number; rate75: number; rate100: number; pendingHours: number; declarations: number };
type OvertimeRow = { employee: { id: string; fullName: string; code: string; department: string | null; organigram: string }; days: OvertimeDay[]; totals: { rate50: number; rate75: number; rate100: number; total: number; pending: number }; confirmedAt: string | null; confirmedBy: { id: string; fullName: string; username: string } | null };

export function OvertimeSummaryPage() {
  const { user } = useAuth();
  const canManage = Boolean(user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)));
  const initial = payrollPeriod(new Date());
  const { filters, update, reset } = useSessionFilters("overtime.summary.filters", { startDate: initial.startDate, endDate: initial.endDate, search: "" });
  const params = useMemo(() => new URLSearchParams(Object.entries(filters).filter(([, value]) => value)), [filters]);
  const rows = useApi<OvertimeRow[]>(`/api/overtime-summary?${params}`, []);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [calendar, setCalendar] = useState<{ id: string; name: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selected = rows.data.find(row => row.employee.id === selectedId) || null;
  const dates = dateRange(filters.startDate, filters.endDate);
  const totals = rows.data.reduce((sum, row) => ({ rate50: sum.rate50 + row.totals.rate50, rate75: sum.rate75 + row.totals.rate75, rate100: sum.rate100 + row.totals.rate100, total: sum.total + row.totals.total, pending: sum.pending + row.totals.pending, confirmed: sum.confirmed + (row.confirmedAt ? 1 : 0) }), { rate50: 0, rate75: 0, rate100: 0, total: 0, pending: 0, confirmed: 0 });

  function movePeriod(offset: number) { const start = new Date(`${filters.startDate}T00:00:00`); start.setMonth(start.getMonth() + offset); const next = payrollPeriod(new Date(start.getFullYear(), start.getMonth(), 26)); update(next); setSelectedId(null); }
  async function toggleConfirmation() { if (!selected) return; setSaving(true); setMessage(null); try { await api(`/api/overtime-summary/${selected.employee.id}/confirm?startDate=${filters.startDate}&endDate=${filters.endDate}`, { method: selected.confirmedAt ? "DELETE" : "POST" }); await rows.reload(); setMessage(selected.confirmedAt ? "Confirmation restaurée." : "Heures supplémentaires confirmées. La ligne est verrouillée en statut normal."); } catch (error) { setMessage(error instanceof Error ? error.message : "Échec de la confirmation."); } finally { setSaving(false); } }

  return <><PageHeader title="Synthèse heures supplémentaires" actions={<Button variant="secondary" onClick={() => window.print()}><Printer size={16} /> Imprimer</Button>} /><section className="panel overtime-summary-page"><div className="row-actions no-print"><Button variant="secondary" onClick={() => movePeriod(-1)}><ChevronLeft size={16} /> Période précédente</Button><div className="period-chip">{formatDate(filters.startDate)} - {formatDate(filters.endDate)}</div><Button variant="secondary" onClick={() => movePeriod(1)}>Période suivante <ChevronRight size={16} /></Button></div><FiltersBar onReset={reset}><FilterField label="Du"><input type="date" value={filters.startDate} onChange={event => update({ startDate: event.target.value })} /></FilterField><FilterField label="Au"><input type="date" value={filters.endDate} onChange={event => update({ endDate: event.target.value })} /></FilterField><FilterField label="Recherche"><div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule..." /></div></FilterField></FiltersBar>
    <div className="overtime-kpis"><Kpi label="Employés" value={rows.data.length} /><Kpi label="À confirmer" value={rows.data.length - totals.confirmed} /><Kpi label="Statut normal" value={totals.confirmed} tone="green" /><Kpi label="Sup. 50%" value={`${round(totals.rate50)} h`} tone="orange" /><Kpi label="Sup. 75%" value={`${round(totals.rate75)} h`} tone="blue" /><Kpi label="Sup. 100%" value={`${round(totals.rate100)} h`} tone="red" /><Kpi label="Total approuvé" value={`${round(totals.total)} h`} tone="green" /><Kpi label="En attente" value={`${round(totals.pending)} h`} tone="orange" /></div>
    <div className="summary-validation-bar no-print"><div className="summary-validation-action"><span>{selected?.employee.fullName || "Cliquez sur le nom d'un employé"}</span>{canManage ? <><Button variant={selected?.confirmedAt ? "secondary" : "primary"} disabled={!selected || new Date().getDate() <= 20 || saving} onClick={toggleConfirmation}>{selected?.confirmedAt ? "Restaurer" : "Confirmer les heures sup."}</Button>{new Date().getDate() <= 20 && <small>Disponible après le 20 du mois</small>}</> : <small>Consultation uniquement</small>}</div></div>{message && <div className={message.includes("Échec") ? "alert alert-error" : "alert alert-success"}>{message}</div>}
    {rows.loading ? <LoadingState label="Chargement de la synthèse heures supplémentaires..." /> : <OvertimeGrid rows={rows.data} dates={dates} selectedId={selectedId} onSelect={setSelectedId} onOpen={employee => setCalendar({ id: employee.id, name: employee.fullName })} />}
  </section><EmployeeMonthlyCalendarModal employee={calendar} from={filters.startDate} to={filters.endDate} payrollVerification onClose={() => setCalendar(null)} /></>;
}

function OvertimeGrid({ rows, dates, selectedId, onSelect, onOpen }: { rows: OvertimeRow[]; dates: string[]; selectedId: string | null; onSelect: (id: string) => void; onOpen: (employee: OvertimeRow["employee"]) => void }) {
  const width = 500 + dates.length * 72 + 240;
  return <div className="overtime-grid-wrap" onScroll={event => { const top = event.currentTarget.querySelector<HTMLElement>(".overtime-top-scroll"); if (top && event.target === event.currentTarget) top.scrollLeft = event.currentTarget.scrollLeft; }}><div className="overtime-top-scroll" onScroll={event => { event.stopPropagation(); if (event.currentTarget.parentElement) event.currentTarget.parentElement.scrollLeft = event.currentTarget.scrollLeft; }}><div style={{ width }} /></div><table className="overtime-grid"><thead><tr><th className="ot-fixed-code">Matricule</th><th className="ot-fixed-name">Employé</th><th className="ot-fixed-org">Organigramme</th>{dates.map(date => <th key={date}>{date.slice(8, 10)}</th>)}<th>50%</th><th>75%</th><th>100%</th><th>Total</th><th>Attente</th></tr></thead><tbody>{rows.map(row => { const byDate = new Map(row.days.map(day => [day.date, day])); return <tr key={row.employee.id} className={`${selectedId === row.employee.id ? "ot-selected" : ""} ${row.confirmedAt ? "ot-confirmed" : ""}`}><td className="ot-fixed-code">{row.employee.code}</td><td className="ot-fixed-name"><button className="employee-row-selector" onClick={() => onSelect(row.employee.id)} onDoubleClick={() => onOpen(row.employee)}><strong>{row.employee.fullName}</strong><small>{row.confirmedAt ? "✓ Statut normal" : "Clic sélectionner · double-clic pointages"}</small></button></td><td className="ot-fixed-org" title={row.employee.organigram}>{row.employee.organigram}</td>{dates.map(date => <td key={date}><OvertimeCell day={byDate.get(date)} /></td>)}<td><Hour value={row.totals.rate50} tone="orange" /></td><td><Hour value={row.totals.rate75} tone="blue" /></td><td><Hour value={row.totals.rate100} tone="red" /></td><td><Hour value={row.totals.total} tone="green" /></td><td><Hour value={row.totals.pending} tone="orange" pending /></td></tr>; })}</tbody></table>{!rows.length && <div className="empty-state">Aucun employé dans ce périmètre.</div>}</div>;
}
function OvertimeCell({ day }: { day?: OvertimeDay }) { if (!day) return <span className="ot-zero">–</span>; return <div className="ot-day-values">{day.rate50 > 0 && <Hour value={day.rate50} tone="orange" />}{day.rate75 > 0 && <Hour value={day.rate75} tone="blue" />}{day.rate100 > 0 && <Hour value={day.rate100} tone="red" />}{day.pendingHours > 0 && <Hour value={day.pendingHours} tone="orange" pending />}</div>; }
function Hour({ value, tone, pending = false }: { value: number; tone: string; pending?: boolean }) { return value ? <span className={`ot-hour ot-${tone} ${pending ? "ot-pending" : ""}`}>{round(value)}h{pending ? " ?" : ""}</span> : <span className="ot-zero">0</span>; }
function Kpi({ label, value, tone = "neutral" }: { label: string; value: string | number; tone?: string }) { return <div className={`ot-kpi ot-kpi-${tone}`}><span>{label}</span><strong>{value}</strong></div>; }
function payrollPeriod(date: Date) { const end = date.getDate() >= 26 ? new Date(date.getFullYear(), date.getMonth() + 1, 25) : new Date(date.getFullYear(), date.getMonth(), 25); const start = new Date(end.getFullYear(), end.getMonth() - 1, 26); return { startDate: key(start), endDate: key(end) }; }
function dateRange(start: string, end: string) { const result: string[] = [], cursor = new Date(`${start}T00:00:00Z`), last = new Date(`${end}T00:00:00Z`); while (cursor <= last) { result.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return result; }
function key(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatDate(value: string) { return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR"); }
function round(value: number) { return Math.round(value * 100) / 100; }
