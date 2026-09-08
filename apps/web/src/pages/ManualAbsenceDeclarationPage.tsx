import { CalendarDays, Search } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { EmployeeMonthlyCalendarModal } from "../components/EmployeeMonthlyCalendarModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { Employee, ManualAbsenceDeclaration } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function ManualAbsenceDeclarationPage() {
  const employees = useApi<Employee[]>("/api/employees", []);
  const declarations = useApi<ManualAbsenceDeclaration[]>("/api/attendance/declarations/manual-absences", []);
  const { filters, update, reset } = useSessionFilters("manual.absence.filters", { search: "", employeeId: "", absenceDate: dateKey(new Date()), reason: "", status: "" });
  const [calendar, setCalendar] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null), [error, setError] = useState<string | null>(null), [saving, setSaving] = useState(false);
  const visibleEmployees = useMemo(() => { const search = filters.search.trim().toLowerCase(); return employees.data.filter(row => !search || `${row.fullName} ${displayCode(row)} ${row.department || ""}`.toLowerCase().includes(search)); }, [employees.data, filters.search]);
  const visibleRows = useMemo(() => { const search = filters.search.trim().toLowerCase(); return declarations.data.filter(row => (!filters.status || row.status === filters.status) && (!filters.employeeId || row.employee.id === filters.employeeId) && (!search || `${row.employee.fullName} ${displayCode(row.employee)} ${row.employee.department || ""}`.toLowerCase().includes(search))); }, [declarations.data, filters.employeeId, filters.search, filters.status]);
  const selectedEmployee = employees.data.find(row => row.id === filters.employeeId);
  async function submit(event: FormEvent) {
    event.preventDefault(); setMessage(null); setError(null);
    if (!filters.employeeId || !filters.absenceDate || !filters.reason.trim()) { setError("Employé, jour et motif sont obligatoires."); return; }
    setSaving(true);
    try { const row = await api<{ status: string }>("/api/attendance/declarations/manual-absences", { method: "POST", body: JSON.stringify({ employeeId: filters.employeeId, absenceDate: filters.absenceDate, reason: filters.reason }) }); setMessage(row.status === "PENDING_APPROVAL" ? "Déclaration envoyée à Admin/DRH pour validation." : "Absence manuelle enregistrée."); update({ reason: "" }); declarations.reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Déclaration impossible."); } finally { setSaving(false); }
  }
  return <><PageHeader title="Déclaration absences" /><section className="panel">
    <div className="alert">Module indépendant : refus automatique si l'absence existe déjà dans Absences, si un pointage réel existe, ou si le jour est couvert par maladie/congé.</div>
    <FiltersBar onReset={reset}><FilterField label="Recherche"><div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule, département..." /></div></FilterField><FilterField label="Employé"><select value={filters.employeeId} onChange={event => update({ employeeId: event.target.value })}><option value="">Choisir...</option>{visibleEmployees.map(row => <option key={row.id} value={row.id}>{displayCode(row)} - {row.fullName}</option>)}</select></FilterField><FilterField label="Statut"><select value={filters.status} onChange={event => update({ status: event.target.value })}><option value="">Tous</option><option value="PENDING_APPROVAL">En attente</option><option value="APPROVED">Approuvé</option><option value="REJECTED">Rejeté</option></select></FilterField></FiltersBar>
    {message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-error">{error}</div>}
    <form className="quick-create declaration-card" onSubmit={submit}><strong>Nouvelle déclaration d'absence</strong>{selectedEmployee && <div className="detail-grid compact"><div><span>Employé</span><strong>{selectedEmployee.fullName}</strong></div><div><span>Matricule</span><strong>{displayCode(selectedEmployee)}</strong></div><div><span>Département</span><strong>{selectedEmployee.department || "-"}</strong></div></div>}<label className="filter-field"><span>Jour d'absence</span><input type="date" value={filters.absenceDate} onChange={event => update({ absenceDate: event.target.value })} /></label><label className="filter-field"><span>Motif obligatoire</span><input value={filters.reason} onChange={event => update({ reason: event.target.value })} placeholder="Expliquer l'absence déclarée..." /></label>{selectedEmployee && <Button variant="secondary" type="button" onClick={() => setCalendar({ id: selectedEmployee.id, name: selectedEmployee.fullName })}><CalendarDays size={15} /> Vérifier pointages / shift</Button>}<Button variant="primary" type="submit" disabled={saving}>{saving ? "Envoi..." : "Déclarer l'absence"}</Button></form>
    <div className="panel-header"><h2>Déclarations de mon périmètre</h2><span className="muted">{visibleRows.length} déclaration(s)</span></div>
    <DataTable rows={visibleRows} loading={declarations.loading} empty="Aucune déclaration d'absence." pageSize={30} columns={[
      { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{displayCode(row.employee)}</span></div>, sortValue: row => row.employee.fullName },
      { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
      { key: "date", header: "Jour", render: row => formatDate(row.absenceDate), sortValue: row => row.absenceDate },
      { key: "reason", header: "Motif", render: row => row.reason, sortValue: row => row.reason },
      { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} />, sortValue: row => row.status },
      { key: "by", header: "Déclaré par", render: row => row.declaredBy?.fullName || row.declaredBy?.username || "-" },
      { key: "approved", header: "Validé par", render: row => row.approvedBy?.fullName || row.approvedBy?.username || "-" },
      { key: "actions", header: "Vérification", render: row => <Button variant="secondary" onClick={() => setCalendar({ id: row.employee.id, name: row.employee.fullName })}><CalendarDays size={15} /> Pointages / shift</Button> }
    ]} />
  </section><EmployeeMonthlyCalendarModal employee={calendar} month={filters.absenceDate.slice(0, 7)} payrollVerification onClose={() => setCalendar(null)} /></>;
}
function displayCode(employee: { localMatricule?: string | null; biotimeCode?: string | null; employeeCode?: string | null }) { return employee.localMatricule || employee.biotimeCode || employee.employeeCode || "-"; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function formatDate(value: string) { return new Date(value).toLocaleDateString("fr-FR"); }
