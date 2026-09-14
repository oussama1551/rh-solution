import { CalendarDays, ChevronLeft, ChevronRight, Pencil, RefreshCw, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { ExportButtons } from "../components/ExportButtons";
import { EmployeeMonthlyCalendarModal } from "../components/EmployeeMonthlyCalendarModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { AttendanceStatusBadge } from "../components/AttendanceStatusBadge";
import { AttendanceStatusLegend } from "../components/AttendanceStatusLegend";
import { LoadingState } from "../components/LoadingState";
import { PageHeader } from "../components/PageHeader";
import { api, fileUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { attendanceStatusClass } from "../lib/attendanceStatus";
import { shiftLabel } from "../lib/shiftLabels";
import { OrgUnit, PayrollSummaryConfirmation, PayrollSummaryMotif, PayrollSummaryOverride, SummaryDailyRecordRow, SummaryReportRow, SyncLog } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function SummaryReportPage() {
  const { can, user } = useAuth();
  const range = currentPayrollPeriod();
  const { filters, update, reset } = useSessionFilters("reports.summary.filters", {
    startDate: range.startDate,
    endDate: range.endDate,
    search: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    status: "ACTIVE"
  });
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;
  const params = useMemo(() => buildParams(filters), [filters]);
  const summary = useApi<SummaryReportRow[]>(`/api/reports/summary?${params.toString()}`, []);
  const [displayMode, setDisplayMode] = useState<"summary" | "detailed">("detailed");
  const detailedRows = useApi<SummaryDailyRecordRow[]>(displayMode === "detailed" ? `/api/reports/summary/daily?${params.toString()}` : null, []);
  const overrides = useApi<PayrollSummaryOverride[]>(`/api/payroll-summary-editor/overrides?startDate=${filters.startDate}&endDate=${filters.endDate}`, []);
  const motifs = useApi<PayrollSummaryMotif[]>("/api/payroll-summary-editor/motifs", []);
  const confirmations = useApi<PayrollSummaryConfirmation[]>(`/api/payroll-summary-editor/confirmations?startDate=${filters.startDate}&endDate=${filters.endDate}`, []);
  const canEdit = Boolean(user?.roles.some(role => ["ADMIN", "DRH", "GRH"].includes(role)));
  const exportParams = useMemo(() => { const value = new URLSearchParams(params); if (displayMode === "detailed") value.set("mode", "detailed"); return value; }, [params, displayMode]);
  const [message, setMessage] = useState<string | null>(null);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [generatedRows, setGeneratedRows] = useState<number | null>(null);
  const [generating, setGenerating] = useState(false);
  const [syncingEmployees, setSyncingEmployees] = useState(false);
  const [calendarEmployee, setCalendarEmployee] = useState<SummaryReportRow["employee"] | null>(null);
  const [editingCell, setEditingCell] = useState<{ employeeId: string; date: string; dates: string[]; activeDate: string } | null>(null);
  const [savingCorrection, setSavingCorrection] = useState(false);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(null);
  const [confirmingEmployee, setConfirmingEmployee] = useState(false);

  async function regenerateSummary() {
    setGenerating(true);
    setMessage(null);
    setGenerateError(null);
    const requestParams = buildParams(filters);
    try {
      const result = await api<{ records: number; generatedAt: string; periodStart: string; periodEnd: string; analysisThrough: string }>(`/api/reports/summary/generate?${requestParams.toString()}`, { method: "POST" });
      setGeneratedRows(result.records);
      setMessage(`Synthèse régénérée pour ${formatDate(result.periodStart)} - ${formatDate(result.periodEnd)}, données calculées jusqu'au ${formatDate(result.analysisThrough)} : ${result.records} jour(s) salarié persisté(s).`);
      await summary.reload();
    } catch (error) {
      setGenerateError(readableError(error, "La génération de la synthèse a échoué."));
    } finally {
      setGenerating(false);
    }
  }

  async function refreshEmployees() {
    setSyncingEmployees(true);
    setMessage(null);
    setGenerateError(null);
    try {
      const result = await api<SyncLog>("/api/sync/run", { method: "POST" });
      setMessage(`Employés BioTime actualisés : ${result.employeesCount} employé(s), ${result.resignsCount} démission(s).`);
      await Promise.all([summary.reload(), detailedRows.reload(), orgTree.reload()]);
    } catch (error) {
      setGenerateError(readableError(error, "L'actualisation des employés BioTime a échoué."));
    } finally {
      setSyncingEmployees(false);
    }
  }

  async function applyCorrection(employeeId: string, date: string, code: string, hasOverride: boolean) {
    setSavingCorrection(true);
    setGenerateError(null);
    try {
      const dates = editingCell?.employeeId === employeeId && code !== "__RESTORE__" ? editingCell.dates : [date];
      await Promise.all(dates.map(selectedDate => api(`/api/payroll-summary-editor/overrides/${employeeId}/${selectedDate}?startDate=${filters.startDate}&endDate=${filters.endDate}`, code === "__RESTORE__" && hasOverride ? { method: "DELETE" } : { method: "PUT", body: JSON.stringify({ code }) })));
      await overrides.reload();
      setEditingCell(null);
      setMessage(code === "__RESTORE__" ? "Valeur calculée restaurée." : `${dates.length} correction(s) enregistrée(s) en base. Les données sources RH restent inchangées.`);
    } catch (error) {
      setGenerateError(readableError(error, "Impossible d'enregistrer la correction."));
    } finally { setSavingCorrection(false); }
  }

  function selectCorrectionCell(cell: { employeeId: string; date: string } | null) {
    if (!cell) { setEditingCell(null); return; }
    setEditingCell(current => {
      if (!current || current.employeeId !== cell.employeeId) return { employeeId: cell.employeeId, date: cell.date, dates: [cell.date], activeDate: cell.date };
      const exists = current.dates.includes(cell.date);
      const dates = exists && current.dates.length > 1 ? current.dates.filter(date => date !== cell.date) : exists ? current.dates : [...current.dates, cell.date];
      const activeDate = exists && current.dates.length > 1 ? dates[dates.length - 1] : cell.date;
      return { employeeId: cell.employeeId, date: activeDate, dates, activeDate };
    });
  }

  async function toggleEmployeeConfirmation() {
    if (!selectedEmployeeId) return;
    setConfirmingEmployee(true); setGenerateError(null);
    const confirmed = confirmations.data.some(item => item.employeeId === selectedEmployeeId);
    try {
      await api(`/api/payroll-summary-editor/confirmations/${selectedEmployeeId}?startDate=${filters.startDate}&endDate=${filters.endDate}`, { method: confirmed ? "DELETE" : "POST" });
      await confirmations.reload();
      setMessage(confirmed ? "Confirmation restaurée." : "Pointages de l'employé confirmés et ligne verrouillée.");
    } catch (error) { setGenerateError(readableError(error, "Impossible de modifier la confirmation.")); }
    finally { setConfirmingEmployee(false); }
  }

  function changePayrollPeriod(monthOffset: number) {
    const currentStart = parseDate(filters.startDate || range.startDate);
    currentStart.setMonth(currentStart.getMonth() + monthOffset);
    const nextStart = new Date(currentStart.getFullYear(), currentStart.getMonth(), 26);
    const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 25);
    update({ startDate: dateKey(nextStart), endDate: dateKey(nextEnd) });
    setMessage(null);
    setGeneratedRows(null);
  }

  const totals = summary.data.reduce(
    (acc, row) => ({
      presentDays: acc.presentDays + row.presentDays,
      absentDays: acc.absentDays + row.absentDays,
      sickDays: acc.sickDays + row.sickDays,
      leaveDays: acc.leaveDays + row.leaveDays,
      compensatedDays: acc.compensatedDays + row.compensatedDays,
      absenceReversedDays: acc.absenceReversedDays + row.absenceReversedDays,
      restDays: acc.restDays + row.restDays,
      incompleteDays: acc.incompleteDays + row.incompleteDays,
      contractNotStartedDays: acc.contractNotStartedDays + row.contractNotStartedDays,
      contractEndedDays: acc.contractEndedDays + row.contractEndedDays,
      workedHours: acc.workedHours + row.totalWorkedHours,
      overtime50: acc.overtime50 + row.overtimeHoursRate50,
      overtime75: acc.overtime75 + row.overtimeHoursRate75,
      overtime100: acc.overtime100 + row.overtimeHoursRate100,
      overtime: acc.overtime + row.totalOvertimeHours
    }),
    { presentDays: 0, absentDays: 0, sickDays: 0, leaveDays: 0, compensatedDays: 0, absenceReversedDays: 0, restDays: 0, incompleteDays: 0, contractNotStartedDays: 0, contractEndedDays: 0, workedHours: 0, overtime50: 0, overtime75: 0, overtime100: 0, overtime: 0 }
  );
  const totalDailyRows = totals.presentDays + totals.absentDays + totals.sickDays + totals.leaveDays + totals.compensatedDays + totals.absenceReversedDays + totals.restDays + totals.incompleteDays + totals.contractNotStartedDays + totals.contractEndedDays;
  const lastGeneratedAt = summary.data.reduce<string | null>((latest, row) => {
    if (row.lastGeneratedAt && (!latest || row.lastGeneratedAt > latest)) return row.lastGeneratedAt;
    return latest;
  }, null);

  return (
    <>
      <PageHeader title="Rapport de synthèse paie" />
      <section className="panel">
        <div className="row-actions">
          <Button variant="secondary" onClick={() => changePayrollPeriod(-1)}>
            <ChevronLeft size={16} /> Période précédente
          </Button>
          <div className="period-chip">
            {formatDate(filters.startDate)} - {formatDate(filters.endDate)}
          </div>
          <Button variant="secondary" onClick={() => changePayrollPeriod(1)}>
            Période suivante <ChevronRight size={16} />
          </Button>
        </div>
        <FiltersBar onReset={reset}>
          <FilterField label="Du"><input type="date" value={filters.startDate} onChange={event => update({ startDate: event.target.value })} /></FilterField>
          <FilterField label="Au"><input type="date" value={filters.endDate} onChange={event => update({ endDate: event.target.value })} /></FilterField>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule..." /></div>
          </FilterField>
          <FilterField label="Unité">
            <select value={filters.unitId} onChange={event => update({ unitId: event.target.value, subUnitId: "", groupId: "" })}>
              <option value="">Toutes</option>
              {orgTree.data.map(unit => <option key={unit.id} value={unit.id}>{unit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Sous-unité">
            <select value={filters.subUnitId} disabled={!selectedUnit} onChange={event => update({ subUnitId: event.target.value, groupId: "" })}>
              <option value="">Toutes</option>
              {selectedUnit?.subUnits.map(subUnit => <option key={subUnit.id} value={subUnit.id}>{subUnit.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Groupe">
            <select value={filters.groupId} disabled={!selectedSubUnit} onChange={event => update({ groupId: event.target.value })}>
              <option value="">Tous</option>
              {selectedSubUnit?.groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
            </select>
          </FilterField>
          <FilterField label="Statut employé">
            <select value={filters.status} onChange={event => update({ status: event.target.value })}>
              <option value="">Tous</option>
              <option value="ACTIVE">Actifs</option>
              <option value="RESIGNED">Démissionnés</option>
            </select>
          </FilterField>
        </FiltersBar>

        <div className="summary-view-switch no-print" aria-label="Mode d'affichage">
          <span>Mode d'affichage</span>
          <button className={displayMode === "summary" ? "active" : ""} onClick={() => setDisplayMode("summary")}>Synthèse</button>
          <button className={displayMode === "detailed" ? "active" : ""} onClick={() => setDisplayMode("detailed")}>Détaillé</button>
        </div>

        <div className="attendance-summary-strip">
          <div><span>Employés affichés</span><strong>{summary.data.length}</strong></div>
          <div><span>Jours synthèse</span><strong>{generatedRows ?? totalDailyRows}</strong></div>
          <div><span>Jours présents</span><strong>{totals.presentDays}</strong></div>
          <div><span>Absences</span><strong>{totals.absentDays}</strong></div>
          <div><span>Maladie</span><strong>{totals.sickDays}</strong></div>
          <div><span>Congé</span><strong>{totals.leaveDays}</strong></div>
          <div><span>Sans preuve</span><strong>{totals.absenceReversedDays}</strong></div>
          <div><span>Heures travaillées</span><strong>{totals.workedHours.toFixed(2)} h</strong></div>
          <div><span>Sup. 50%</span><strong>{totals.overtime50.toFixed(2)} h</strong></div>
          <div><span>Sup. 75%</span><strong>{totals.overtime75.toFixed(2)} h</strong></div>
          <div><span>Sup. 100%</span><strong>{totals.overtime100.toFixed(2)} h</strong></div>
          <div><span>Heures sup. total</span><strong>{totals.overtime.toFixed(2)} h</strong></div>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {generateError && <div className="alert alert-error">{generateError}</div>}
        {summary.error && <div className="alert alert-error">Impossible de charger la synthèse persistée: {summary.error}</div>}

        <div className="row-actions">
          {can("sync.run") && <Button variant="secondary" onClick={refreshEmployees} disabled={syncingEmployees || generating}>
            <RefreshCw size={16} /> {syncingEmployees ? "Actualisation employés..." : "Actualiser employés BioTime"}
          </Button>}
          <Button variant="primary" onClick={regenerateSummary} disabled={generating || syncingEmployees}>
            <RefreshCw size={16} /> {generating ? "Génération..." : "Régénérer la période"}
          </Button>
          <ExportButtons excelUrl={fileUrl("/api/reports/summary/export/excel", exportParams)} pdfUrl={fileUrl("/api/reports/summary/export/pdf", exportParams)} />
          {lastGeneratedAt && <span className="muted">Dernière génération: {new Date(lastGeneratedAt).toLocaleString("fr-FR")}</span>}
        </div>
        <AttendanceStatusLegend />
        {displayMode === "detailed" && <div className="summary-validation-bar no-print"><div className="summary-validation-stats"><span><b>{summary.data.length - confirmations.data.length}</b> À confirmer</span><span className="is-normal"><b>{confirmations.data.length}</b> Statut normal</span></div><div className="summary-validation-action"><span>{selectedEmployeeId ? summary.data.find(row => row.employee.id === selectedEmployeeId)?.employee.fullName : "Cliquez sur le nom d'un employé"}</span>{canEdit ? <><Button variant={confirmations.data.some(item => item.employeeId === selectedEmployeeId) ? "secondary" : "primary"} disabled={!selectedEmployeeId || new Date().getDate() <= 20 || confirmingEmployee} onClick={toggleEmployeeConfirmation}>{confirmations.data.some(item => item.employeeId === selectedEmployeeId) ? "Restaurer" : "Confirmer les pointages"}</Button>{new Date().getDate() <= 20 && <small>Disponible après le 20 du mois</small>}</> : <small>Consultation uniquement</small>}</div></div>}
        {editingCell && <div className="multi-day-selection no-print"><strong>{editingCell.dates.length} case(s) sélectionnée(s)</strong><span>Un seul employé · {editingCell.dates.slice().sort().map(date => date.slice(8, 10)).join(", ")}</span><button type="button" onClick={() => setEditingCell(null)}>Annuler</button></div>}

        {displayMode === "summary" ? <DataTable
          rows={summary.data}
          loading={summary.loading || orgTree.loading}
          loadingLabel="Chargement de la synthèse persistée..."
          pageSize={50}
          empty="Aucune synthèse générée pour cette période. Cliquez sur Régénérer."
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span>{row.employee.attendanceTrackingExempt && <span className="badge badge-blue" title={row.employee.attendanceExemptReason || undefined}>Exclu du suivi</span>}</div>, sortValue: row => row.employee.fullName },
            { key: "org", header: "Organigramme", render: row => [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-", sortValue: row => `${row.employee.unitName || ""}${row.employee.subUnitName || ""}${row.employee.groupName || ""}` },
            { key: "present", header: "Présents", render: row => summaryValue(row.presentDays, "green"), sortValue: row => row.presentDays },
            { key: "absent", header: "Absents", render: row => summaryValue(row.absentDays, "orange"), sortValue: row => row.absentDays },
            { key: "sick", header: "Maladie", render: row => summaryValue(row.sickDays, "orange"), sortValue: row => row.sickDays },
            { key: "leave", header: "Congé", render: row => summaryValue(row.leaveDays, "orange"), sortValue: row => row.leaveDays },
            { key: "comp", header: "Compensés", render: row => summaryValue(row.compensatedDays, "green"), sortValue: row => row.compensatedDays },
            { key: "reversed", header: "Sans preuve", render: row => summaryValue(row.absenceReversedDays, "orange"), sortValue: row => row.absenceReversedDays },
            { key: "rest", header: "Repos", render: row => summaryValue(row.restDays, "blue"), sortValue: row => row.restDays },
            { key: "inc", header: "Incomplets", render: row => summaryValue(row.incompleteDays, "orange"), sortValue: row => row.incompleteDays },
            { key: "hours", header: "Heures", render: row => `${row.totalWorkedHours} h`, sortValue: row => row.totalWorkedHours },
            { key: "ot50", header: "Sup. 50%", render: row => summaryValue(row.overtimeHoursRate50, "orange", " h"), sortValue: row => row.overtimeHoursRate50 },
            { key: "ot75", header: "Sup. 75%", render: row => summaryValue(row.overtimeHoursRate75, "orange", " h"), sortValue: row => row.overtimeHoursRate75 },
            { key: "ot100", header: "Sup. 100%", render: row => summaryValue(row.overtimeHoursRate100, "orange", " h"), sortValue: row => row.overtimeHoursRate100 },
            { key: "ot", header: "Total sup.", render: row => summaryValue(row.totalOvertimeHours, "orange", " h"), sortValue: row => row.totalOvertimeHours },
            { key: "calendar", header: "Calendrier", render: row => (
              <Button variant="ghost" onClick={() => setCalendarEmployee(row.employee)}>
                <CalendarDays size={16} /> Voir
              </Button>
            ) },
            { key: "period", header: "Période analysée", render: () => `${formatDate(filters.startDate)} - ${formatDate(filters.endDate)}`, sortValue: () => `${filters.startDate}${filters.endDate}` },
          ]}
        /> : <DetailedSummaryTable rows={summary.data} dailyRows={detailedRows.data} overrides={overrides.data} motifs={motifs.data} confirmations={confirmations.data} selectedEmployeeId={selectedEmployeeId} startDate={filters.startDate} endDate={filters.endDate} loading={summary.loading || detailedRows.loading} canEdit={canEdit} editingCell={editingCell} saving={savingCorrection} onEdit={selectCorrectionCell} onSelect={applyCorrection} onEmployeeSelect={setSelectedEmployeeId} onEmployeeOpen={employee => setCalendarEmployee(employee)} />}
      </section>
      <EmployeeMonthlyCalendarModal employee={calendarEmployee ? { id: calendarEmployee.id, name: calendarEmployee.fullName } : null} from={filters.startDate} to={filters.endDate} payrollVerification onClose={() => setCalendarEmployee(null)} />
    </>
  );
}

function summaryValue(value: number, tone: "green" | "orange" | "blue", suffix = "") {
  return <span className={`summary-value-pill ${value ? `summary-value-${tone}` : "summary-value-zero"}`}>{value}{suffix}</span>;
}

function DetailedSummaryTable({ rows, dailyRows, overrides, motifs, confirmations, selectedEmployeeId, startDate, endDate, loading, canEdit, editingCell, saving, onEdit, onSelect, onEmployeeSelect, onEmployeeOpen }: { rows: SummaryReportRow[]; dailyRows: SummaryDailyRecordRow[]; overrides: PayrollSummaryOverride[]; motifs: PayrollSummaryMotif[]; confirmations: PayrollSummaryConfirmation[]; selectedEmployeeId: string | null; startDate: string; endDate: string; loading: boolean; canEdit: boolean; editingCell: { employeeId: string; date: string; dates: string[]; activeDate: string } | null; saving: boolean; onEdit: (cell: { employeeId: string; date: string } | null) => void; onSelect: (employeeId: string, date: string, code: string, hasOverride: boolean) => Promise<void>; onEmployeeSelect: (id: string) => void; onEmployeeOpen: (employee: SummaryReportRow["employee"]) => void }) {
  if (loading) return <LoadingState label="Chargement de la synthèse détaillée..." />;
  const dates = dateRange(startDate, endDate), byDay = new Map(dailyRows.map(row => [`${row.employeeId}:${row.workDate}`, row]));
  const byOverride = new Map(overrides.map(item => [`${item.employeeId}:${item.workDate.slice(0, 10)}`, item]));
  const confirmedIds = new Set(confirmations.map(item => item.employeeId));
  const totalCodes = ["P", "A", "AA", "AI", "AM", "ADC", "DCS", "SAN", "AT", "AMA", "AD", "M", "C", "RC", "R", "I", "DC", "FC"];
  const tableWidth = 500 + dates.length * 34 + totalCodes.length * 48;
  return <div className="detailed-summary-wrap" onScroll={event => { const top = event.currentTarget.querySelector<HTMLElement>(".detailed-top-scroll"); if (top && event.target === event.currentTarget && top.scrollLeft !== event.currentTarget.scrollLeft) top.scrollLeft = event.currentTarget.scrollLeft; }}><div className="detailed-top-scroll" onScroll={event => { event.stopPropagation(); const wrap = event.currentTarget.parentElement; if (wrap && wrap.scrollLeft !== event.currentTarget.scrollLeft) wrap.scrollLeft = event.currentTarget.scrollLeft; }}><div style={{ width: tableWidth }} /></div><table className="detailed-summary-table"><thead><tr><th className="fixed-code">Matricule</th><th className="fixed-name">Nom Prénom</th><th className="fixed-structure">Structure / Département</th>{dates.map(date => <th key={date} className="day-column" title={formatDate(date)}>{date.slice(8, 10)}</th>)}{totalCodes.map(code => <th key={code} className="total-column">T.{code}</th>)}</tr></thead><tbody>{rows.map(row => {
    const effective = dates.map(date => byOverride.get(`${row.employee.id}:${date}`)?.overrideCode || effectiveDailyCode(byDay.get(`${row.employee.id}:${date}`)));
    const confirmed = confirmedIds.has(row.employee.id), selected = selectedEmployeeId === row.employee.id;
    return <tr key={row.employee.id} className={`${row.employee.attendanceTrackingExempt ? "summary-exempt-row" : ""} ${confirmed ? "summary-confirmed-row" : ""} ${selected ? "summary-selected-row" : ""}`}><td className="fixed-code">{row.employee.code}</td><td className="fixed-name"><button type="button" className="employee-row-selector" onClick={() => onEmployeeSelect(row.employee.id)} onDoubleClick={() => onEmployeeOpen(row.employee)}><strong>{row.employee.fullName}</strong><small>{confirmed ? "✓ Statut normal" : "Cliquer pour sélectionner · double-clic pour le calendrier"}</small></button>{row.employee.attendanceTrackingExempt && <span className="badge badge-blue" title={row.employee.attendanceExemptReason || undefined}>Exclu</span>}</td><td className="fixed-structure">{[row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || row.employee.department || "-"}</td>{dates.map((date, index) => {
      const dailyRecord = byDay.get(`${row.employee.id}:${date}`), originalCode = effectiveDailyCode(dailyRecord), override = byOverride.get(`${row.employee.id}:${date}`), code = effective[index];
      const active = editingCell?.employeeId === row.employee.id && editingCell.activeDate === date;
      const multiSelected = editingCell?.employeeId === row.employee.id && editingCell.dates.includes(date);
      return <td key={date} className={`day-column ${canEdit && !confirmed ? "editable-day" : ""} ${multiSelected ? "daily-cell-selected" : ""} ${dailyRecord?.absenceDetail ? "has-absence-hint" : ""}`} onClick={() => canEdit && !confirmed && !active && onEdit({ employeeId: row.employee.id, date })} title={confirmed ? "Pointages confirmés — ligne verrouillée" : override ? `Corrigé par ${override.editedBy?.fullName || override.editedBy?.username || "utilisateur"} — calcul initial: ${originalCode || "vide"}` : canEdit ? "Cliquer pour corriger" : undefined}>{active ? <KeyboardCodeEditor motifs={motifs} currentCode={code || "A"} originalCode={originalCode} hasOverride={Boolean(override)} saving={saving} onCancel={() => onEdit(null)} onSave={value => onSelect(row.employee.id, date, value, Boolean(override))} /> : <>{code && <span className={`daily-code daily-code-${code.toLowerCase()} ${override ? "daily-code-overridden" : ""}`}>{code}{override && <Pencil size={9} />}</span>}{dailyRecord?.absenceDetail&&<AbsenceDayHint detail={dailyRecord.absenceDetail}/>}</>}</td>;
    })}{totalCodes.map(code => <td key={code} className="total-column">{summaryValue(effective.filter(value => value === code).length, code === "P" ? "green" : code === "R" ? "blue" : "orange")}</td>)}</tr>;
  })}</tbody></table>{!rows.length && <div className="empty-state">Aucune synthèse générée pour cette période.</div>}</div>;
}

function KeyboardCodeEditor({ motifs, currentCode, hasOverride, saving, onCancel, onSave }: { motifs: PayrollSummaryMotif[]; currentCode: string; originalCode: string; hasOverride: boolean; saving: boolean; onCancel: () => void; onSave: (code: string) => Promise<void> }) {
  const initial = Math.max(0, motifs.findIndex(item => item.code === currentCode));
  const [index, setIndex] = useState(initial);
  const motif = motifs[index] || motifs[0];
  if (!motif) return null;
  function move(direction: number) { setIndex(value => (value + direction + motifs.length) % motifs.length); }
  return <div className="keyboard-code-editor" onClick={event => event.stopPropagation()}><div className="keyboard-code-hint"><b>{motif.code} · {motif.label}</b><span>↑ ↓ changer · Entrée valider · Échap annuler{hasOverride ? " · Ctrl+Z restaurer" : ""}</span></div><button autoFocus type="button" disabled={saving} className={`daily-code daily-code-${motif.code.toLowerCase()} daily-code-keyboard`} onKeyDown={event => { if (event.key === "ArrowDown" || event.key === "ArrowRight") { event.preventDefault(); move(1); } else if (event.key === "ArrowUp" || event.key === "ArrowLeft") { event.preventDefault(); move(-1); } else if (event.key === "Enter") { event.preventDefault(); void onSave(motif.code); } else if (event.key === "Escape") { event.preventDefault(); onCancel(); } else if (event.ctrlKey && event.key.toLowerCase() === "z" && hasOverride) { event.preventDefault(); void onSave("__RESTORE__"); } }}>{motif.code}</button><span className="keyboard-arrows">↕</span></div>;
}

function AbsenceDayHint({ detail }: { detail: NonNullable<SummaryDailyRecordRow["absenceDetail"]> }) {
  return <div className={`absence-day-hint ${detail.kind.toLowerCase()}`}><strong>{detail.label}</strong>{detail.detail&&<span>{detail.detail.replace(/_/g," ")}</span>}<small>Du {formatDate(detail.dateStart)} au {formatDate(detail.dateEnd)}</small>{detail.note&&<em>{detail.note}</em>}<b>Cliquer pour corriger</b></div>;
}

function dateRange(startDate: string, endDate: string) { const dates: string[] = [], cursor = new Date(`${startDate}T00:00:00Z`), end = new Date(`${endDate}T00:00:00Z`); while (cursor <= end) { dates.push(cursor.toISOString().slice(0, 10)); cursor.setUTCDate(cursor.getUTCDate() + 1); } return dates; }
function shortStatus(status?: SummaryDailyRecordRow["status"]) { return status === "PRESENT" ? "P" : status === "ABSENT" ? "A" : status === "SICK" || status === "ACCIDENT" ? "M" : status === "LEAVE" ? "C" : status === "COMPENSATED" ? "CP" : status === "REST" ? "R" : status === "INCOMPLETE" ? "I" : status === "ABSENCE_REVERSED" ? "SP" : status === "CONTRACT_NOT_STARTED" ? "DC" : status === "CONTRACT_ENDED" ? "FC" : ""; }
function effectiveDailyCode(row?: SummaryDailyRecordRow) { return row?.displayCode || shortStatus(row?.status); }

function SummaryPunchCalendar({ rows, startDate, endDate }: { rows: SummaryDailyRecordRow[]; startDate: string; endDate: string }) {
  const byDate = new Map(rows.map(row => [row.workDate, row]));
  const totals = rows.reduce(
    (acc, row) => ({
      complete: acc.complete + (row.status === "PRESENT" || row.status === "COMPENSATED" ? 1 : 0),
      incomplete: acc.incomplete + (row.status === "INCOMPLETE" ? 1 : 0),
      absent: acc.absent + (row.status === "ABSENT" ? 1 : 0),
      sick: acc.sick + (row.status === "SICK" || row.status === "ACCIDENT" ? 1 : 0),
      leave: acc.leave + (row.status === "LEAVE" ? 1 : 0),
      reversed: acc.reversed + (row.status === "ABSENCE_REVERSED" ? 1 : 0),
      repos: acc.repos + (row.status === "REST" ? 1 : 0),
      hours: acc.hours + row.workedHours
    }),
    { complete: 0, incomplete: 0, absent: 0, sick: 0, leave: 0, reversed: 0, repos: 0, hours: 0 }
  );

  return (
    <>
      <div className="attendance-summary-strip compact">
        <div><span>Complet</span><strong>{totals.complete}</strong></div>
        <div><span>Incomplet</span><strong>{totals.incomplete}</strong></div>
        <div><span>Absent</span><strong>{totals.absent}</strong></div>
        <div><span>Maladie</span><strong>{totals.sick}</strong></div>
        <div><span>Congé</span><strong>{totals.leave}</strong></div>
        <div><span>Sans preuve</span><strong>{totals.reversed}</strong></div>
        <div><span>Repos</span><strong>{totals.repos}</strong></div>
        <div><span>Heures</span><strong>{totals.hours.toFixed(2)} h</strong></div>
      </div>
      <AttendanceStatusLegend />
      <div className="period-calendar report-calendar">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="calendar-head">{day}</div>)}
        {buildDateCells(startDate, endDate).map(cell => {
          if (!cell.date) return <div key={cell.key} className="calendar-day calendar-empty" />;
          const row = byDate.get(cell.date);
          const shift = row?.shiftType || null;
          const leaveDetail = row?.status === "LEAVE" && row.leaveType ? `Congé ${leaveTypeLabel(row.leaveType)}${row.exceptionalReason ? ` - ${exceptionalReasonLabel(row.exceptionalReason)}` : ""}` : undefined;
          return (
            <div key={cell.date} title={leaveDetail} className={`calendar-day planner-day ${shift ? `calendar-${shift.toLowerCase()}` : ""} report-status-${attendanceStatusClass(row?.status)}`}>
              <strong>{cell.day}</strong>
              <small>{cell.month}</small>
              {shift && <span className={`shift-badge shift-badge-${shift.toLowerCase()}`}>{shiftLabel(shift)}</span>}
              {leaveDetail && <small>{leaveDetail}</small>}
              {row && row.overtimeHours > 0 && <span>Sup: <b>{row.overtimeHours} h</b></span>}
              <span>Heures: <b>{row ? `${row.workedHours} h` : "-"}</b></span>
              <AttendanceStatusBadge status={row?.status || "EMPTY"} />
            </div>
          );
        })}
      </div>
    </>
  );
}

function currentPayrollPeriod() {
  const today = new Date();
  const startDay = 26;
  const end = today.getDate() >= startDay
    ? new Date(today.getFullYear(), today.getMonth() + 1, startDay - 1)
    : new Date(today.getFullYear(), today.getMonth(), startDay - 1);
  const start = new Date(end.getFullYear(), end.getMonth() - 1, startDay);
  return { startDate: dateKey(start), endDate: dateKey(end) };
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function parseDate(value: string) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value: string) {
  return parseDate(value).toLocaleDateString("fr-FR");
}

function buildParams(filters: Record<string, string>) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
}

function buildDateCells(startDate: string, endDate: string) {
  const first = new Date(`${startDate}T00:00:00`);
  const end = new Date(`${endDate}T00:00:00`);
  const formatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  const cells = Array.from({ length: (first.getDay() + 6) % 7 }, (_, index) => ({ key: `empty-${index}`, date: null as string | null, day: "", month: "" }));
  for (let cursor = new Date(first); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
    cells.push({ key: dateKey(cursor), date: dateKey(cursor), day: String(cursor.getDate()).padStart(2, "0"), month: formatter.format(cursor) });
  }
  return cells;
}

function leaveTypeLabel(value: string) {
  if (value === "EXCEPTIONNEL") return "exceptionnel";
  if (value === "SANS_SOLDE") return "sans solde";
  if (value === "MATERNITE") return "maternité";
  return "annuel";
}

function exceptionalReasonLabel(value: string) {
  const labels: Record<string, string> = {
    MARIAGE_EMPLOYE: "mariage employé",
    NAISSANCE_ENFANT: "naissance enfant",
    MARIAGE_ENFANT: "mariage descendant",
    DECES_CONJOINT: "décès conjoint",
    DECES_PARENT_PROCHE: "décès parent proche",
    CIRCONCISION_FILS: "circoncision fils",
    HAJJ: "Hajj"
  };
  return labels[value] || value;
}

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || fallback;
  } catch {
    return error.message || fallback;
  }
}
