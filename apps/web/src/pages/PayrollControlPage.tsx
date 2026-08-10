import { Download, RefreshCw, Search, UploadCloud } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { api, fileUrl } from "../lib/api";
import { PayrollControlResponse, PayrollControlRow, PayrollMapTarget, PayrollRubricMapping } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function PayrollControlPage() {
  const range = currentPayrollPeriod();
  const { filters, update } = useSessionFilters("payroll.control.filters", {
    startDate: range.startDate,
    endDate: range.endDate,
    period: sapPeriodFromEnd(range.endDate),
    search: "",
    onlyDiff: "false"
  });
  const params = useMemo(() => buildParams(filters), [filters]);
  const comparison = useApi<PayrollControlResponse>(`/api/payroll-control/compare?${params.toString()}`, emptyComparison(filters));
  const rubrics = useApi<PayrollRubricMapping[]>("/api/payroll-control/rubrics", []);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function importSapPayroll() {
    setBusy(true);
    setMessage(null);
    setError(null);
    try {
      const result = await api<{ lines: number; rubrics: number; period: string }>(`/api/payroll-control/import?period=${encodeURIComponent(filters.period)}`, { method: "POST" });
      setMessage(`Import SAP terminé: ${result.lines} ligne(s), ${result.rubrics} rubrique(s) pour ${result.period}.`);
      rubrics.reload();
      comparison.reload();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Import SAP impossible.");
    } finally {
      setBusy(false);
    }
  }

  async function updateRubric(code: string, mapsTo: PayrollMapTarget) {
    await api(`/api/payroll-control/rubrics/${encodeURIComponent(code)}`, {
      method: "PATCH",
      body: JSON.stringify({ mapsTo })
    });
    rubrics.reload();
    comparison.reload();
  }

  function changePeriod(offset: number) {
    const start = parseDate(filters.startDate);
    start.setMonth(start.getMonth() + offset);
    const nextStart = new Date(start.getFullYear(), start.getMonth(), 26);
    const nextEnd = new Date(nextStart.getFullYear(), nextStart.getMonth() + 1, 25);
    update({ startDate: dateKey(nextStart), endDate: dateKey(nextEnd), period: sapPeriodFromEnd(dateKey(nextEnd)) });
    setMessage(null);
  }

  return (
    <>
      <PageHeader title="Contrôle de paie" />
      <section className="panel">
        <div className="row-actions">
          <Button variant="secondary" onClick={() => changePeriod(-1)}>Période précédente</Button>
          <div className="period-chip">{formatDate(filters.startDate)} - {formatDate(filters.endDate)}</div>
          <Button variant="secondary" onClick={() => changePeriod(1)}>Période suivante</Button>
        </div>
        <FiltersBar onReset={() => update({ ...range, period: sapPeriodFromEnd(range.endDate), search: "", onlyDiff: "false" })}>
          <FilterField label="Du"><input type="date" value={filters.startDate} onChange={event => update({ startDate: event.target.value })} /></FilterField>
          <FilterField label="Au"><input type="date" value={filters.endDate} onChange={event => update({ endDate: event.target.value, period: sapPeriodFromEnd(event.target.value) })} /></FilterField>
          <FilterField label="Période SAP"><input value={filters.period} onChange={event => update({ period: event.target.value })} placeholder="Ex: 7/2026" /></FilterField>
          <FilterField label="Recherche">
            <div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom, matricule, groupe..." /></div>
          </FilterField>
          <FilterField label="Affichage">
            <select value={filters.onlyDiff} onChange={event => update({ onlyDiff: event.target.value })}>
              <option value="false">Tous</option>
              <option value="true">Écarts seulement</option>
            </select>
          </FilterField>
        </FiltersBar>

        <div className="attendance-summary-strip">
          <div><span>Employés</span><strong>{comparison.data.totals.employees}</strong></div>
          <div><span>Avec écart</span><strong>{comparison.data.totals.withDiff}</strong></div>
          <div><span>Tolérance</span><strong>{comparison.data.tolerance}</strong></div>
          <div><span>Rubriques SAP</span><strong>{rubrics.data.length}</strong></div>
        </div>

        {message && <div className="alert alert-success">{message}</div>}
        {error && <div className="alert alert-error">{error}</div>}

        <div className="row-actions">
          <Button variant="primary" onClick={importSapPayroll} disabled={busy}>
            <UploadCloud size={16} /> {busy ? "Import..." : "Importer les données de paie SAP"}
          </Button>
          <Button variant="secondary" onClick={() => comparison.reload()}>
            <RefreshCw size={16} /> Recalculer
          </Button>
          <a className="btn btn-secondary" href={fileUrl("/api/payroll-control/export.csv", params)}>
            <Download size={16} /> CSV
          </a>
        </div>

        <div className="panel-header">
          <h2>Comparaison RH Solution / SAP</h2>
          <span className="muted">Base SAP comparée par rubrique mappée</span>
        </div>
        <DataTable
          rows={comparison.data.rows}
          loading={comparison.loading}
          loadingLabel="Calcul du contrôle de paie..."
          empty="Aucune ligne à comparer pour cette période."
          pageSize={40}
          columns={[
            { key: "employee", header: "Employé", render: row => <div className={`table-main-cell ${row.hasDiff ? "payroll-diff-cell" : ""}`}><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>, sortValue: row => row.employee.fullName },
            { key: "org", header: "Organigramme", render: row => row.employee.org, sortValue: row => row.employee.org },
            { key: "badge", header: "État", render: row => row.hasDiff ? <span className="badge badge-red">Écart détecté</span> : <span className="badge badge-green">OK</span>, sortValue: row => row.hasDiff ? 1 : 0 },
            categoryColumn("Absence", "absence"),
            categoryColumn("Maladie", "sick"),
            categoryColumn("Comp.", "compensation"),
            categoryColumn("Sup. 50%", "overtime50"),
            categoryColumn("Sup. 75%", "overtime75"),
            categoryColumn("Sup. 100%", "overtime100")
          ]}
        />

        <div className="panel-header">
          <h2>Mapping des rubriques SAP</h2>
          <span className="muted">IGNORED = non utilisé dans la comparaison</span>
        </div>
        <DataTable
          rows={rubrics.data}
          loading={rubrics.loading}
          loadingLabel="Chargement des rubriques..."
          empty="Aucune rubrique importée."
          pageSize={30}
          columns={[
            { key: "code", header: "Code", render: row => <strong>{row.rubricCode}</strong>, sortValue: row => row.rubricCode },
            { key: "label", header: "Libellé", render: row => row.rubricLabel || "-", sortValue: row => row.rubricLabel || "" },
            { key: "count", header: "Lignes importées", render: row => row.importCount, sortValue: row => row.importCount },
            { key: "maps", header: "Catégorie RH", render: row => (
              <select value={row.mapsTo} onChange={event => updateRubric(row.rubricCode, event.target.value as PayrollMapTarget)}>
                {payrollTargets.map(target => <option key={target} value={target}>{target}</option>)}
              </select>
            ), sortValue: row => row.mapsTo }
          ]}
        />
      </section>
    </>
  );
}

const payrollTargets: PayrollMapTarget[] = ["IGNORED", "ABSENCE", "SICK", "COMPENSATION", "OVERTIME_50", "OVERTIME_75", "OVERTIME_100"];

function categoryColumn(label: string, key: keyof PayrollControlRow["rh"]) {
  return {
    key,
    header: label,
    render: (row: PayrollControlRow) => (
      <div className={Math.abs(row.diff[key]) > 0 ? "payroll-diff-values" : ""}>
        <span>RH {formatNumber(row.rh[key])}</span>
        <span>SAP {formatNumber(row.sap[key])}</span>
        <strong>Δ {formatNumber(row.diff[key])}</strong>
      </div>
    ),
    sortValue: (row: PayrollControlRow) => Math.abs(row.diff[key])
  };
}

function emptyComparison(filters: { period: string; startDate: string; endDate: string }): PayrollControlResponse {
  return { period: filters.period, startDate: filters.startDate, endDate: filters.endDate, tolerance: 0, rows: [], totals: { employees: 0, withDiff: 0 } };
}

function buildParams(filters: Record<string, string>) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
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

function sapPeriodFromEnd(endDate: string) {
  const date = parseDate(endDate);
  return `${date.getMonth() + 1}/${date.getFullYear()}`;
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

function formatNumber(value: number) {
  return Number(value || 0).toFixed(2).replace(".00", "");
}
