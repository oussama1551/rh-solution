import { CalendarDays, Check, ChevronDown, FileSpreadsheet, Printer, RefreshCw, RotateCcw, Search, UploadCloud, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { EmployeeMonthlyCalendarModal } from "../components/EmployeeMonthlyCalendarModal";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { api, fileUrl } from "../lib/api";
import { useAuth } from "../lib/auth";
import { PayrollControlResponse, PayrollControlRow, PayrollOperationalResponse, PayrollOperationalRow, PayrollRubricMapping } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function PayrollControlPage() {
  const { user } = useAuth();
  const payrollReadOnly = Boolean(user?.roles.includes("GRH") && !user.roles.includes("ADMIN") && !user.roles.includes("DRH"));
  const range = currentPayrollPeriod();
  const { filters, update } = useSessionFilters("payroll.control.manual.filters", { startDate: range.startDate, endDate: range.endDate, period: sapPeriodFromEnd(range.endDate), search: "" });
  const [selected, setSelected] = useState<string[]>([]);
  const [tab, setTab] = useState<"pending" | "confirmed">("pending");
  const [calendar, setCalendar] = useState<{ id: string; name: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [rubricPickerOpen, setRubricPickerOpen] = useState(false);
  const [rubricSearch, setRubricSearch] = useState("");
  const [mode, setMode] = useState<"operational" | "bulletin">("operational");
  const [operationalPeriod, setOperationalPeriod] = useState(currentSapMonth());
  const [sapImportPeriod, setSapImportPeriod] = useState(previousSapMonth());
  const [operationalCategory, setOperationalCategory] = useState<"ABSENCE" | "OVERTIME">("ABSENCE");
  const [verdictFilter, setVerdictFilter] = useState<"ALL" | "PENDING" | "GOOD" | "NOT_GOOD">("ALL");
  const [orgFilter, setOrgFilter] = useState("ALL");
  const [responsibleFilter, setResponsibleFilter] = useState("ALL");
  const [attachmentFilter, setAttachmentFilter] = useState<"ALL" | "NO_ORG" | "NO_PLANNING">("ALL");
  const [selectedOperational, setSelectedOperational] = useState<string[]>([]);
  const [printingOperational, setPrintingOperational] = useState(false);
  const rubrics = useApi<PayrollRubricMapping[]>(filters.period ? `/api/payroll-control/rubrics?period=${encodeURIComponent(filters.period)}` : null, []);
  const periods = useApi<Array<{ period: string; lineCount: number }>>("/api/payroll-control/periods", []);
  useEffect(() => {
    if (periods.data.length && !periods.data.some(row => row.period === filters.period) && filters.period !== normalizeSapPeriod(sapImportPeriod)) update({ period: periods.data[0].period });
  }, [periods.data, filters.period, sapImportPeriod, update]);
  useEffect(() => setSelected(current => current.filter(code => rubrics.data.some(row => row.rubricCode === code))), [rubrics.data]);
  const params = useMemo(() => new URLSearchParams({ period: filters.period, startDate: filters.startDate, endDate: filters.endDate, search: filters.search, rubricCodes: selected.join(","), tab }), [filters, selected, tab]);
  const result = useApi<PayrollControlResponse>(selected.length ? `/api/payroll-control/rows?${params}` : null, emptyResult(filters));
  const visibleRubrics = useMemo(() => {
    const search = rubricSearch.trim().toLowerCase();
    return rubrics.data.filter(row => !search || `${row.rubricCode} ${row.rubricLabel || ""}`.toLowerCase().includes(search));
  }, [rubrics.data, rubricSearch]);
  const operationalParams = useMemo(() => new URLSearchParams({ period: operationalPeriod, category: operationalCategory, search: filters.search }), [operationalPeriod, operationalCategory, filters.search]);
  const operational = useApi<PayrollOperationalResponse>(mode === "operational" ? `/api/payroll-control/operational?${operationalParams}` : null, emptyOperational(operationalPeriod, operationalCategory));

  function toggleRubric(code: string) { setSelected(current => current.includes(code) ? current.filter(item => item !== code) : [...current, code]); }
  async function importSapPayroll() {
    setBusy(true); setError(null); setMessage(null);
    try { const period = normalizeSapPeriod(sapImportPeriod); if (!period) throw new Error("Période invalide. Utilisez le format M/AAAA, par exemple 8/2026."); const imported = await api<{ lines: number; rubrics: number }>(`/api/payroll-control/import?period=${encodeURIComponent(period)}`, { method: "POST" }); setSapImportPeriod(period); update({ period }); setSelected([]); setMessage(`Bulletin SAP ${period} importé : ${imported.lines} ligne(s), ${imported.rubrics} rubrique(s).`); periods.reload(); rubrics.reload(); result.reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Import SAP impossible."); } finally { setBusy(false); }
  }
  async function changeStatus(row: PayrollControlRow, action: "confirm" | "restore") {
    setError(null);
    if (!row.employee.id) return setError("Ce salarié du bulletin SAP doit d'abord être lié à un employé RH/BioTime avant confirmation.");
    try {
      await api(`/api/payroll-control/${action}`, { method: "POST", body: JSON.stringify({ employeeId: row.employee.id, periodStart: filters.startDate, periodEnd: filters.endDate, rubricCodes: selected.join(",") }) });
      setMessage(action === "confirm" ? "Contrôle confirmé." : "Contrôle restauré dans À vérifier."); result.reload();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Action impossible."); }
  }
  async function reviewOperational(row: PayrollOperationalRow, verdict: "GOOD" | "NOT_GOOD") {
    setError(null);
    try { await api("/api/payroll-control/operational/review", { method: "POST", body: JSON.stringify({ sourceKey: row.sourceKey, period: operationalPeriod, category: operationalCategory, verdict }) }); setMessage(verdict === "GOOD" ? "Cas marqué Bon." : "Cas marqué Pas bon."); operational.reload(); }
    catch (caught) { setError(caught instanceof Error ? caught.message : "Décision impossible."); }
  }
  function printList() { document.body.dataset.printMode = "payroll-control"; const cleanup = () => { delete document.body.dataset.printMode; window.removeEventListener("afterprint", cleanup); }; window.addEventListener("afterprint", cleanup); window.setTimeout(() => window.print(), 50); }
  function exportBulletin() { window.location.href = fileUrl("/api/payroll-control/export", params); }
  function printOperationalSelection() {
    if (!selectedOperational.length) return;
    setPrintingOperational(true); document.body.dataset.printMode = "payroll-control";
    const cleanup = () => { delete document.body.dataset.printMode; setPrintingOperational(false); window.removeEventListener("afterprint", cleanup); };
    window.addEventListener("afterprint", cleanup); window.setTimeout(() => window.print(), 150);
  }
  function changePeriod(offset: number) { const start = parseDate(filters.startDate); start.setMonth(start.getMonth() + offset); const nextStart = new Date(start.getFullYear(), start.getMonth(), 26), nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 25); update({ startDate: dateKey(nextStart), endDate: dateKey(nextEnd), period: sapPeriodFromEnd(dateKey(nextEnd)) }); setSelected([]); }

  const columns = [
    { key: "employee", header: "Employé", render: (row: PayrollControlRow) => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span>{!row.employee.linked && <span className="badge badge-orange">Bulletin SAP — non lié</span>}{row.employee.attendanceTrackingExempt && <span className="badge badge-blue" title={row.employee.attendanceExemptReason || undefined}>Exclu du suivi pointage</span>}</div>, sortValue: (row: PayrollControlRow) => row.employee.fullName },
    { key: "org", header: "Département / organigramme", render: (row: PayrollControlRow) => <div className="table-main-cell"><strong>{row.employee.department}</strong><span>{row.employee.org}</span></div>, sortValue: (row: PayrollControlRow) => row.employee.org },
    ...selected.map(code => ({ key: `rubric-${code}`, header: code, render: (row: PayrollControlRow) => <div className="table-main-cell"><strong>Base {formatNumber(row.rubricValues[code]?.base)}</strong><span>Montant {formatNumber(row.rubricValues[code]?.amount)}</span></div>, sortValue: (row: PayrollControlRow) => row.rubricValues[code]?.base || 0 })),
    { key: "punch", header: "Jours pointés", render: (row: PayrollControlRow) => row.employee.attendanceTrackingExempt || !row.employee.linked ? "—" : row.punchDays, sortValue: (row: PayrollControlRow) => row.punchDays },
    { key: "empty", header: "Jours vides", render: (row: PayrollControlRow) => row.employee.attendanceTrackingExempt || !row.employee.linked ? "—" : <span className={row.warnings.manyEmptyDays ? "badge badge-orange" : ""}>{row.emptyDays}</span>, sortValue: (row: PayrollControlRow) => row.emptyDays },
    { key: "leave", header: "Maladie / Congé", render: (row: PayrollControlRow) => <div><span>{row.sickDays} / {row.leaveDays}</span>{row.warnings.punchOnLeaveOrSick && <span className="badge badge-red"> Pointage + déclaration ({row.punchOnLeaveOrSickDays})</span>}</div>, sortValue: (row: PayrollControlRow) => row.sickDays + row.leaveDays },
    ...(tab === "confirmed" ? [{ key: "confirmed", header: "Confirmation", render: (row: PayrollControlRow) => <div className="table-main-cell"><strong>{row.confirmedBy?.fullName || row.confirmedBy?.username || "-"}</strong><span>{row.confirmedAt ? new Date(row.confirmedAt).toLocaleString("fr-FR") : "-"}</span></div>, sortValue: (row: PayrollControlRow) => row.confirmedAt || "" }] : []),
    { key: "actions", header: "Actions", render: (row: PayrollControlRow) => row.employee.id ? <div className="row-actions no-print">{!row.employee.attendanceTrackingExempt && <Button variant="secondary" onClick={() => setCalendar({ id: row.employee.id!, name: row.employee.fullName })}><CalendarDays size={15} /> Voir pointages / shift</Button>}{!payrollReadOnly && (tab === "pending" ? <Button variant="primary" onClick={() => changeStatus(row, "confirm")}><Check size={15} /> Confirmer</Button> : <Button variant="secondary" onClick={() => changeStatus(row, "restore")}><RotateCcw size={15} /> Restaurer</Button>)}</div> : <span className="badge badge-gray">Consultation uniquement</span> }
  ];

  if (mode === "operational") {
    const orgOptions = [...new Map(operational.data.rows.filter(row => row.hasOrganigram).map(row => [row.orgKey, row.org])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const responsibleOptions = [...new Map(operational.data.rows.filter(row => row.responsibleId).map(row => [row.responsibleId!, row.responsibleName || "Responsable"])).entries()].sort((a, b) => a[1].localeCompare(b[1]));
    const selectedOrgLabel = orgFilter === "ALL" ? "Tous" : orgOptions.find(([id]) => id === orgFilter)?.[1] || "Organigramme sélectionné";
    const selectedResponsibleLabel = responsibleFilter === "ALL" ? "Tous" : responsibleOptions.find(([id]) => id === responsibleFilter)?.[1] || "Responsable sélectionné";
    const operationalRows = operational.data.rows.filter(row => (verdictFilter === "ALL" || (verdictFilter === "PENDING" ? !row.verdict : row.verdict === verdictFilter)) && (orgFilter === "ALL" || row.orgKey === orgFilter) && (responsibleFilter === "ALL" || row.responsibleId === responsibleFilter) && (attachmentFilter === "ALL" || (attachmentFilter === "NO_ORG" ? !row.hasOrganigram : !row.hasPlanning)));
    const printableOperationalRows = printingOperational ? operationalRows.filter(row => selectedOperational.includes(row.sourceKey)) : operationalRows;
    const payrollRange = sapPayrollRange(operationalPeriod);
    const operationalColumns = [
      ...(!printingOperational ? [{ key: "selection", header: "Sélection", render: (row: PayrollOperationalRow) => <label className="payroll-row-selector no-print"><input type="checkbox" checked={selectedOperational.includes(row.sourceKey)} onChange={() => setSelectedOperational(current => current.includes(row.sourceKey) ? current.filter(key => key !== row.sourceKey) : [...current, row.sourceKey])} /><span /></label> }] : []),
      { key: "employee", header: "Employé", render: (row: PayrollOperationalRow) => <div className="table-main-cell"><strong>{row.fullName}</strong><span>{row.company}-{row.sapMatricule}</span></div>, sortValue: (row: PayrollOperationalRow) => row.fullName },
      { key: "org", header: "Département / organigramme", render: (row: PayrollOperationalRow) => <div className="table-main-cell"><strong>{row.department}</strong><span>{row.org}</span><div className="payroll-row-flags">{!row.hasOrganigram && <span className="payroll-flag danger">Sans organigramme</span>}{!row.hasPlanning && <span className="payroll-flag warning">Sans planning</span>}{row.responsibleName && <span className="payroll-flag neutral">{row.responsibleName}</span>}</div></div>, sortValue: (row: PayrollOperationalRow) => row.org },
      ...(operationalCategory === "ABSENCE" ? [
        { key: "types", header: "Types d'absence", render: (row: PayrollOperationalRow) => row.absenceTypes.length ? row.absenceTypes.map(type => <span key={type} className="badge badge-orange">{type}</span>) : "-", sortValue: (row: PayrollOperationalRow) => row.absenceTypes.join(",") },
        { key: "days", header: "Nombre de jours", render: (row: PayrollOperationalRow) => formatNumber(row.absenceDays), sortValue: (row: PayrollOperationalRow) => row.absenceDays },
        { key: "hours", header: "Nombre d'heures", render: (row: PayrollOperationalRow) => formatNumber(row.absenceHours), sortValue: (row: PayrollOperationalRow) => row.absenceHours },
        { key: "rh-warning", header: "Contrôle RH", render: (row: PayrollOperationalRow) => { const detail = [row.rhPrincipalAbsenceDays ? `${row.rhPrincipalAbsenceDays} depuis Absences` : "", row.rhConfirmedAbsenceDays ? `${row.rhConfirmedAbsenceDays} confirmée(s)` : "", row.rhManualAbsenceDays ? `${row.rhManualAbsenceDays} manuelle(s)` : ""].filter(Boolean).join(" + "); return row.missingRhAbsenceInSap ? <div className="payroll-rh-warning"><span className="badge badge-orange">Absent dans SAP</span><small>{detail}</small></div> : detail ? <div className="payroll-rh-warning"><span className="badge badge-blue">Absence RH trouvée</span><small>{detail}</small></div> : <span className="badge badge-green">Cohérent</span>; }, sortValue: (row: PayrollOperationalRow) => row.missingRhAbsenceInSap ? 2 : row.rhPrincipalAbsenceDays + row.rhConfirmedAbsenceDays + row.rhManualAbsenceDays ? 1 : 0 }
      ] : [
        { key: "dates", header: "Détail par jour", render: (row: PayrollOperationalRow) => <OvertimeDays details={row.overtimeDetails} />, sortValue: (row: PayrollOperationalRow) => row.overtimeDates.length },
        { key: "h50", header: "Heures 50%", render: (row: PayrollOperationalRow) => <HourCircle value={row.overtime50} rate="50" />, sortValue: (row: PayrollOperationalRow) => row.overtime50 },
        { key: "h75", header: "Heures 75%", render: (row: PayrollOperationalRow) => <HourCircle value={row.overtime75} rate="75" />, sortValue: (row: PayrollOperationalRow) => row.overtime75 },
        { key: "h100", header: "Heures 100%", render: (row: PayrollOperationalRow) => <HourCircle value={row.overtime100} rate="100" />, sortValue: (row: PayrollOperationalRow) => row.overtime100 },
        { key: "rh-overtime", header: "Saisie RH Solution", render: (row: PayrollOperationalRow) => <div className="payroll-rh-overtime"><OvertimeTotals h50={row.rhOvertime50} h75={row.rhOvertime75} h100={row.rhOvertime100} /><OvertimeDays details={row.rhOvertimeDetails} /></div>, sortValue: (row: PayrollOperationalRow) => row.rhOvertime50 + row.rhOvertime75 + row.rhOvertime100 },
        { key: "overtime-control", header: "Contrôle SAP / RH", render: (row: PayrollOperationalRow) => <OvertimeComparison row={row} />, sortValue: (row: PayrollOperationalRow) => row.overtimeMatches ? 0 : 1 }
      ]),
      { key: "verdict", header: "Décision", render: (row: PayrollOperationalRow) => row.verdict === "GOOD" ? <span className="badge badge-green">Bon</span> : row.verdict === "NOT_GOOD" ? <span className="badge badge-red">Pas bon</span> : <span className="badge badge-gray">À vérifier</span>, sortValue: (row: PayrollOperationalRow) => row.verdict || "" },
      { key: "actions", header: "Actions", render: (row: PayrollOperationalRow) => <div className="row-actions no-print">{row.localEmployeeId && <Button variant="secondary" onClick={() => setCalendar({ id: row.localEmployeeId!, name: row.fullName })}><CalendarDays size={15} /> Pointages / shift</Button>}{!payrollReadOnly && <><Button variant="primary" onClick={() => reviewOperational(row, "GOOD")}><Check size={15} /> Bon</Button><Button variant="danger" onClick={() => reviewOperational(row, "NOT_GOOD")}><X size={15} /> Pas bon</Button></>}</div> }
    ];
    return <>
      <PageHeader title="Contrôle paie" />
      <section className="panel payroll-control-print">
        <ModeTabs mode={mode} setMode={setMode} />
        {payrollReadOnly && <div className="alert alert-info no-print">Accès GRH en lecture seule : consultation, calendrier, filtres et impression uniquement.</div>}
        <div className="payroll-mode-intro"><strong>Mode 1 — Données variables du mois</strong><span>Lecture directe SAP : disponible sans attendre le calcul du bulletin.</span></div>
        <FiltersBar onReset={() => { setOperationalPeriod(currentSapMonth()); setOperationalCategory("ABSENCE"); setVerdictFilter("ALL"); setOrgFilter("ALL"); setResponsibleFilter("ALL"); setAttachmentFilter("ALL"); update({ search: "" }); }}>
          <FilterField label="Mois SAP"><input value={operationalPeriod} onChange={event => setOperationalPeriod(event.target.value)} placeholder="8/2026" /></FilterField>
          <FilterField label="Données"><select value={operationalCategory} onChange={event => setOperationalCategory(event.target.value as "ABSENCE" | "OVERTIME")}><option value="ABSENCE">Toutes les absences</option><option value="OVERTIME">Toutes les heures supplémentaires</option></select></FilterField>
          <FilterField label="Décision"><select value={verdictFilter} onChange={event => setVerdictFilter(event.target.value as typeof verdictFilter)}><option value="ALL">Toutes</option><option value="PENDING">À vérifier</option><option value="GOOD">Bon</option><option value="NOT_GOOD">Pas bon</option></select></FilterField>
          <FilterField label="Organigramme"><select value={orgFilter} onChange={event => setOrgFilter(event.target.value)}><option value="ALL">Tous les organigrammes</option>{orgOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></FilterField>
          <FilterField label="Responsable"><select value={responsibleFilter} onChange={event => setResponsibleFilter(event.target.value)}><option value="ALL">Tous les responsables</option>{responsibleOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}</select></FilterField>
          <FilterField label="Rattachement / planning"><select value={attachmentFilter} onChange={event => setAttachmentFilter(event.target.value as typeof attachmentFilter)}><option value="ALL">Tous les salariés</option><option value="NO_ORG">Sans organigramme</option><option value="NO_PLANNING">Sans planning sur la période</option></select></FilterField>
          <FilterField label="Recherche"><div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule, société..." /></div></FilterField>
        </FiltersBar>
        {message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-error">{error}</div>}
        <div className="payroll-print-context"><strong>Contrôle paie — Mode 1</strong><span>Période : {operationalPeriod}</span><span>Données : {operationalCategory === "ABSENCE" ? "Absences" : "Heures supplémentaires"}</span><span>Décision : {verdictLabel(verdictFilter)}</span><span>Responsable : {selectedResponsibleLabel}</span><span>Organigramme : {selectedOrgLabel}</span><span>Situation : {attachmentLabel(attachmentFilter)}</span><span>{selectedOperational.length} ligne(s) sélectionnée(s)</span></div>
        <div className="attendance-summary-strip compact"><div><span>Employés</span><strong>{operational.data.totals.employees}</strong></div><div><span>À vérifier</span><strong>{operational.data.totals.pending}</strong></div><div><span>Bon</span><strong>{operational.data.totals.good}</strong></div><div><span>Pas bon</span><strong>{operational.data.totals.notGood}</strong></div></div>
        <div className="payroll-selection-toolbar no-print"><span><b>{selectedOperational.length}</b> sélectionnée(s)</span><Button variant="secondary" onClick={() => setSelectedOperational(operationalRows.map(row => row.sourceKey))} disabled={!operationalRows.length}>Tout sélectionner ({operationalRows.length})</Button><Button variant="ghost" onClick={() => setSelectedOperational([])} disabled={!selectedOperational.length}>Effacer</Button></div>
        <div className="panel-header"><div><h2>{operationalCategory === "ABSENCE" ? "Absences SAP" : "Heures supplémentaires SAP"} — {operationalPeriod}</h2><span className="muted">Décision manuelle uniquement : Bon / Pas bon</span></div><div className="row-actions no-print"><Button variant="secondary" onClick={() => operational.reload()}><RefreshCw size={15} /> Actualiser SAP</Button><Button variant="secondary" onClick={printOperationalSelection} disabled={!selectedOperational.length}><Printer size={15} /> Imprimer la sélection ({selectedOperational.length})</Button></div></div>
        <DataTable rows={printableOperationalRows} loading={operational.loading} loadingLabel="Lecture des données SAP..." empty="Aucune donnée SAP pour ce mois et ces filtres." pageSize={printingOperational ? Math.max(1, printableOperationalRows.length) : 40} columns={operationalColumns} />
      </section>
      <EmployeeMonthlyCalendarModal employee={calendar} from={payrollRange.from} to={payrollRange.to} payrollVerification onClose={() => setCalendar(null)} />
    </>;
  }

  return <>
    <PageHeader title="Contrôle paie" />
    <section className="panel payroll-control-print">
      <ModeTabs mode={mode} setMode={setMode} />
      {payrollReadOnly && <div className="alert alert-info no-print">Accès GRH en lecture seule : aucune confirmation ni modification SAP autorisée.</div>}
      <div className="payroll-mode-intro"><strong>Mode 2 — Rubriques du bulletin</strong><span>Contrôle manuel des rubriques après calcul du bulletin SAP.</span></div>
      <div className="row-actions no-print"><Button variant="secondary" onClick={() => changePeriod(-1)}>Fenêtre précédente</Button><div className="period-chip">Pointages à vérifier : {formatDate(filters.startDate)} - {formatDate(filters.endDate)}</div><Button variant="secondary" onClick={() => changePeriod(1)}>Fenêtre suivante</Button></div>
      <FiltersBar onReset={() => update({ ...range, period: sapPeriodFromEnd(range.endDate), search: "" })}>
        <FilterField label="Du"><input type="date" value={filters.startDate} onChange={event => update({ startDate: event.target.value })} /></FilterField>
        <FilterField label="Au"><input type="date" value={filters.endDate} onChange={event => update({ endDate: event.target.value, period: sapPeriodFromEnd(event.target.value) })} /></FilterField>
        <FilterField label="Bulletin SAP calculé"><select value={filters.period} onChange={event => { update({ period: event.target.value }); setSelected([]); }}><option value="">Choisir un bulletin disponible...</option>{periods.data.map(row => <option key={row.period} value={row.period}>{row.period} · {row.lineCount} lignes</option>)}</select></FilterField>
        <FilterField label="Recherche"><div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule, organigramme..." /></div></FilterField>
      </FiltersBar>
      <div className="payroll-period-explanation"><strong>Deux périodes indépendantes :</strong><span>les dates Du/Au définissent les pointages à vérifier.</span><span>Le bulletin SAP fournit les rubriques de paie déjà calculées. Août apparaîtra uniquement après son calcul et son import dans SAP.</span></div>
      {message && <div className="alert alert-success">{message}</div>}{error && <div className="alert alert-error">{error}</div>}
      <div className="payroll-rubric-toolbar no-print">
        <div className="payroll-rubric-heading"><span>Rubriques du bulletin {filters.period}</span><strong>{selected.length ? `${selected.length} sélectionnée(s)` : "Sélection requise"}</strong></div>
        <div className="payroll-rubric-picker">
          <button type="button" className={`payroll-rubric-trigger ${selected.length ? "has-selection" : ""}`} onClick={() => setRubricPickerOpen(open => !open)}>
            <span><strong>{selected.length ? `${selected.length} rubrique(s)` : "Choisir les rubriques"}</strong><small>{selected.length ? "Modifier la sélection" : `${rubrics.data.length} disponibles`}</small></span><ChevronDown size={17} />
          </button>
          {rubricPickerOpen && <div className="payroll-rubric-menu">
            <div className="payroll-rubric-menu-head"><strong>Sélection des rubriques</strong><button className="icon-button" onClick={() => setRubricPickerOpen(false)} title="Fermer"><X size={16} /></button></div>
            <div className="input-icon"><Search size={15} /><input autoFocus value={rubricSearch} onChange={event => setRubricSearch(event.target.value)} placeholder="Code ou libellé..." /></div>
            <div className="payroll-rubric-menu-actions"><button onClick={() => setSelected(rubrics.data.map(row => row.rubricCode))}>Tout sélectionner</button><button onClick={() => setSelected([])}>Effacer</button><span>{selected.length}/{rubrics.data.length}</span></div>
            <div className="payroll-rubric-list">
              {visibleRubrics.map(row => <label key={row.rubricCode} className={selected.includes(row.rubricCode) ? "selected" : ""}><input type="checkbox" checked={selected.includes(row.rubricCode)} onChange={() => toggleRubric(row.rubricCode)} /><span><strong>{row.rubricCode}</strong><small>{row.rubricLabel || "Sans libellé"}</small></span><em>{row.importCount}</em></label>)}
              {!visibleRubrics.length && <div className="empty-state compact">Aucune rubrique trouvée.</div>}
            </div>
            <Button variant="primary" onClick={() => setRubricPickerOpen(false)} disabled={!selected.length}><Check size={15} /> Appliquer la sélection</Button>
          </div>}
        </div>
        {!payrollReadOnly && <div className="payroll-sap-import"><label><span>Période à importer</span><input value={sapImportPeriod} onChange={event => setSapImportPeriod(event.target.value)} placeholder="8/2026" /></label><Button variant="secondary" onClick={importSapPayroll} disabled={busy || !normalizeSapPeriod(sapImportPeriod)}><UploadCloud size={15} /> {busy ? "Import..." : `Importer SAP ${normalizeSapPeriod(sapImportPeriod) || ""}`}</Button></div>}
        {selected.length > 0 && <div className="payroll-selected-chips">{selected.slice(0, 5).map(code => <button key={code} onClick={() => toggleRubric(code)} title="Retirer"><span>{code}</span><X size={13} /></button>)}{selected.length > 5 && <span className="payroll-more-chip">+{selected.length - 5}</span>}</div>}
      </div>
      <div className="tabs no-print"><button className={tab === "pending" ? "active" : ""} onClick={() => setTab("pending")}>À vérifier</button><button className={tab === "confirmed" ? "active" : ""} onClick={() => setTab("confirmed")}>Confirmés</button></div>
      <div className="panel-header"><div><h2>{tab === "pending" ? "À vérifier" : "Confirmés"}</h2><span className="muted">{selected.length ? `${result.data.totals.employees} employé(s) · ${selected.length} rubrique(s)` : "Sélectionnez les rubriques à afficher"}</span></div><div className="row-actions no-print"><Button variant="secondary" onClick={() => result.reload()} disabled={!selected.length}><RefreshCw size={15} /> Actualiser</Button><Button variant="secondary" onClick={exportBulletin} disabled={!selected.length || !result.data.rows.length}><FileSpreadsheet size={15} /> Exporter Excel ({result.data.rows.length})</Button><Button variant="secondary" onClick={printList} disabled={!selected.length}><Printer size={15} /> Imprimer {tab === "pending" ? "À vérifier" : "Confirmés"}</Button></div></div>
      <DataTable rows={result.data.rows} loading={result.loading} loadingLabel="Chargement du contrôle manuel..." empty={selected.length ? "Aucun employé pour ces rubriques et filtres." : "Sélectionnez au moins une rubrique SAP."} pageSize={40} columns={columns} />
    </section>
    <EmployeeMonthlyCalendarModal employee={calendar} from={filters.startDate} to={filters.endDate} payrollVerification onClose={() => setCalendar(null)} />
  </>;
}

function HourCircle({ value, rate }: { value: number; rate: "50" | "75" | "100" }) { return <span className={`payroll-hour-circle rate-${rate}`}><strong>{formatNumber(value)}</strong><small>h</small></span>; }
function OvertimeDays({ details }: { details: PayrollOperationalRow["overtimeDetails"] }) {
  if (!details.length) return <span className="muted">Aucune heure</span>;
  return <div className="payroll-overtime-days">{details.map(detail => <div key={detail.date} className="payroll-overtime-day"><span>{shortDate(detail.date)}</span><strong>{formatNumber(detail.total)} h</strong><div>{detail.hours50 > 0 && <i className="rate-50">50% · {formatNumber(detail.hours50)}h</i>}{detail.hours75 > 0 && <i className="rate-75">75% · {formatNumber(detail.hours75)}h</i>}{detail.hours100 > 0 && <i className="rate-100">100% · {formatNumber(detail.hours100)}h</i>}</div></div>)}</div>;
}
function OvertimeTotals({ h50, h75, h100 }: { h50: number; h75: number; h100: number }) { return <div className="payroll-overtime-totals"><span className="rate-50">50% · {formatNumber(h50)} h</span><span className="rate-75">75% · {formatNumber(h75)} h</span><span className="rate-100">100% · {formatNumber(h100)} h</span></div>; }
function OvertimeComparison({ row }: { row: PayrollOperationalRow }) {
  if (row.overtimeMatches) return <span className="badge badge-green">Cohérent</span>;
  return <div className="payroll-overtime-comparison"><span className="badge badge-orange">Différence trouvée</span>{row.overtimeDifference50 !== 0 && <small className="rate-50">50% : SAP {formatNumber(row.overtime50)}h / RH {formatNumber(row.rhOvertime50)}h</small>}{row.overtimeDifference75 !== 0 && <small className="rate-75">75% : SAP {formatNumber(row.overtime75)}h / RH {formatNumber(row.rhOvertime75)}h</small>}{row.overtimeDifference100 !== 0 && <small className="rate-100">100% : SAP {formatNumber(row.overtime100)}h / RH {formatNumber(row.rhOvertime100)}h</small>}</div>;
}
function shortDate(value: string) { const date = parseDate(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit" }); }
function verdictLabel(value: "ALL" | "PENDING" | "GOOD" | "NOT_GOOD") { return ({ ALL: "Toutes", PENDING: "À vérifier", GOOD: "Bon", NOT_GOOD: "Pas bon" } as const)[value]; }
function attachmentLabel(value: "ALL" | "NO_ORG" | "NO_PLANNING") { return ({ ALL: "Tous les salariés", NO_ORG: "Sans organigramme", NO_PLANNING: "Sans planning" } as const)[value]; }
function emptyResult(filters: { period: string; startDate: string; endDate: string }): PayrollControlResponse { return { period: filters.period, startDate: filters.startDate, endDate: filters.endDate, rubricCodes: [], rubricHash: "", rows: [], totals: { employees: 0 } }; }
function currentPayrollPeriod() { const today = new Date(), end = today.getDate() >= 26 ? new Date(today.getFullYear(), today.getMonth() + 1, 25) : new Date(today.getFullYear(), today.getMonth(), 25), start = new Date(end.getFullYear(), end.getMonth() - 1, 26); return { startDate: dateKey(start), endDate: dateKey(end) }; }
function sapPeriodFromEnd(value: string) { const date = parseDate(value); return `${date.getMonth() + 1}/${date.getFullYear()}`; }
function dateKey(date: Date) { return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`; }
function parseDate(value: string) { return new Date(`${value}T00:00:00`); }
function formatDate(value: string) { return parseDate(value).toLocaleDateString("fr-FR"); }
function formatNumber(value?: number) { return Number(value || 0).toLocaleString("fr-FR", { maximumFractionDigits: 2 }); }
function currentSapMonth() { const today = new Date(); return `${today.getMonth() + 1}/${today.getFullYear()}`; }
function previousSapMonth() { const date = new Date(); date.setMonth(date.getMonth() - 1); return `${date.getMonth() + 1}/${date.getFullYear()}`; }
function normalizeSapPeriod(value: string) { const match = /^\s*(\d{1,2})\s*[\/-]\s*(\d{4})\s*$/.exec(value); if (!match) return ""; const month = Number(match[1]); return month >= 1 && month <= 12 ? `${month}/${match[2]}` : ""; }
function sapPayrollRange(period: string) { const [month, year] = period.split("/").map(Number); const safeMonth = month >= 1 && month <= 12 ? month : new Date().getMonth() + 1, safeYear = year || new Date().getFullYear(); return { from: dateKey(new Date(safeYear, safeMonth - 2, 26)), to: dateKey(new Date(safeYear, safeMonth - 1, 25)) }; }
function emptyOperational(period: string, category: "ABSENCE" | "OVERTIME"): PayrollOperationalResponse { return { period, category, rows: [], totals: { employees: 0, good: 0, notGood: 0, pending: 0 } }; }
function ModeTabs({ mode, setMode }: { mode: "operational" | "bulletin"; setMode: (mode: "operational" | "bulletin") => void }) { return <div className="payroll-mode-tabs no-print"><button className={mode === "operational" ? "active" : ""} onClick={() => setMode("operational")}><strong>Mode 1</strong><span>Absences & heures sup.</span></button><button className={mode === "bulletin" ? "active" : ""} onClick={() => setMode("bulletin")}><strong>Mode 2</strong><span>Rubriques du bulletin</span></button></div>; }
