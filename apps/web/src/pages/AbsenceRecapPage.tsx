import { CalendarCheck, Search } from "lucide-react";
import { useMemo } from "react";
import { DataTable } from "../components/DataTable";
import { ExportButtons } from "../components/ExportButtons";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { fileUrl } from "../lib/api";
import { AbsenceRecapReport, AbsenceTypeCode, OrgUnit } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function AbsenceRecapPage() {
  const range = currentPayrollPeriod();
  const { filters, update, reset } = useSessionFilters("absence.recap.filters", {
    startDate: range.startDate,
    endDate: range.endDate,
    search: "",
    unitId: "",
    subUnitId: "",
    groupId: "",
    status: "ACTIVE",
    classificationStatus: "",
    typeCode: ""
  });
  const orgTree = useApi<OrgUnit[]>("/api/org/tree", []);
  const absenceTypes = useApi<AbsenceTypeCode[]>("/api/attendance/absence-types", []);
  const selectedUnit = orgTree.data.find(unit => unit.id === filters.unitId) || null;
  const selectedSubUnit = selectedUnit?.subUnits.find(subUnit => subUnit.id === filters.subUnitId) || null;
  const params = useMemo(() => buildParams(filters), [filters]);
  const recap = useApi<AbsenceRecapReport>(`/api/reports/absences/recap?${params.toString()}`, {
    period: { startDate: filters.startDate, endDate: filters.endDate },
    totals: { absences: 0, pending: 0, confirmed: 0 },
    byType: [],
    rows: []
  });

  return (
    <>
      <PageHeader title="Récap des absences" />
      <section className="panel">
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
          <FilterField label="Statut">
            <select value={filters.classificationStatus} onChange={event => update({ classificationStatus: event.target.value })}>
              <option value="">Tous</option>
              <option value="PENDING">En attente</option>
              <option value="CONFIRMED">Confirmé</option>
            </select>
          </FilterField>
          <FilterField label="Type">
            <select value={filters.typeCode} onChange={event => update({ typeCode: event.target.value, classificationStatus: event.target.value ? "CONFIRMED" : filters.classificationStatus })}>
              <option value="">Tous</option>
              {absenceTypes.data.map(type => <option key={type.code} value={type.code}>{type.code} - {type.label}</option>)}
            </select>
          </FilterField>
        </FiltersBar>

        {recap.error && <div className="alert alert-error">Impossible de charger le récap des absences.</div>}

        <div className="attendance-summary-strip">
          <div><span>Total absences</span><strong>{recap.data.totals.absences}</strong></div>
          <div className={recap.data.totals.pending > 0 ? "summary-warning" : ""}><span>En attente</span><strong>{recap.data.totals.pending}</strong></div>
          <div><span>Confirmées</span><strong>{recap.data.totals.confirmed}</strong></div>
          {recap.data.byType.map(type => (
            <div key={type.code}><span>{type.code}</span><strong>{type.days}</strong></div>
          ))}
        </div>

        <div className="row-actions">
          <ExportButtons excelUrl={fileUrl("/api/reports/absences/recap/export/excel", params)} pdfUrl={fileUrl("/api/reports/absences/recap/export/pdf", params)} />
        </div>

        <DataTable
          rows={recap.data.rows}
          loading={recap.loading || orgTree.loading}
          loadingLabel="Chargement du récap..."
          empty="Aucune absence dans la synthèse pour cette période."
          pageSize={50}
          columns={[
            { key: "date", header: "Jour", render: row => formatDate(row.date), sortValue: row => row.date },
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>, sortValue: row => row.employee.fullName },
            { key: "org", header: "Organigramme", render: row => [row.employee.unitName, row.employee.subUnitName, row.employee.groupName].filter(Boolean).join(" > ") || "-", sortValue: row => `${row.employee.unitName || ""}${row.employee.subUnitName || ""}${row.employee.groupName || ""}` },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "status", header: "Statut", render: row => row.classificationStatus === "CONFIRMED" ? <StatusBadge value="APPROVED" label="Confirmé" /> : <StatusBadge value="PENDING_APPROVAL" label="En attente" />, sortValue: row => row.classificationStatus },
            { key: "type", header: "Type", render: row => row.type ? <strong>{row.type.code} - {row.type.label}</strong> : "-", sortValue: row => row.type?.code || "" },
            { key: "note", header: "Note", render: row => row.declaration?.note || "-" },
            { key: "declared", header: "Classifié par", render: row => row.declaration?.declaredBy?.fullName || row.declaration?.declaredBy?.username || "-" },
            { key: "approved", header: "Approuvé par", render: row => row.declaration?.approvedBy?.fullName || row.declaration?.approvedBy?.username || "-" },
            { key: "icon", header: "", render: () => <CalendarCheck size={16} /> }
          ]}
        />
      </section>
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

function formatDate(value: string) {
  return new Date(`${value}T00:00:00`).toLocaleDateString("fr-FR");
}

function buildParams(filters: Record<string, string>) {
  return new URLSearchParams(Object.entries(filters).filter(([, value]) => value));
}
