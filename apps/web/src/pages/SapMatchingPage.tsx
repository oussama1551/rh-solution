import { Check, RefreshCw, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { extractSapCompany } from "../lib/sap";
import { Employee, SapAllMappingRow, SapDirectoryCacheStatus, SapEmployee, SapQueue, SapQueueItem } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function SapMatchingPage() {
  const { can } = useAuth();
  const [view, setView] = useState<"queue" | "all" | "directory">("queue");
  const queue = useApi<SapQueue>("/api/sap-matching/queue", { pending: [], unmapped: [] });
  const { filters, update, reset } = useSessionFilters("sap.matching.filters", { search: "" });
  const allFilters = useSessionFilters("sap.matching.all.filters", { search: "", company: "", status: "" });
  const directoryFilters = useSessionFilters("sap.matching.directory.list.filters", { search: "", company: "" });
  const allParams = new URLSearchParams(Object.entries(allFilters.filters).filter(([, value]) => value));
  const all = useApi<SapAllMappingRow[]>(`/api/sap-matching/all?${allParams.toString()}`, []);
  const directoryParams = new URLSearchParams({ search: directoryFilters.filters.search });
  const directoryRows = useApi<SapEmployee[]>(`/api/sap-matching/directory?${directoryParams.toString()}`, []);
  const cacheStatus = useApi<SapDirectoryCacheStatus>("/api/sap-matching/cache-status", {
    loaded: false,
    employeeCount: 0,
    refreshedAt: null,
    ttlMinutes: 15,
    expiresAt: null
  });
  const [selectedSapByEmployee, setSelectedSapByEmployee] = useState<Record<string, string>>({});
  const [manualSearchByEmployee, setManualSearchByEmployee] = useState<Record<string, string>>({});
  const [manualResultsByEmployee, setManualResultsByEmployee] = useState<Record<string, SapEmployee[]>>({});
  const [searchingEmployee, setSearchingEmployee] = useState<string | null>(null);
  const [manualErrorByEmployee, setManualErrorByEmployee] = useState<Record<string, string | null>>({});
  const searchTimers = useRef<Record<string, number>>({});
  const [message, setMessage] = useState<string | null>(null);
  const rows = [...queue.data.pending, ...queue.data.unmapped].filter(item => {
    const search = filters.search.trim().toLowerCase();
    if (!search) return true;
    return [
      item.employee.fullName,
      item.employee.zktecoId,
      item.employee.biotimeCode,
      item.employee.employeeCode
    ].some(value => (value || "").toLowerCase().includes(search));
  });

  async function runAuto() {
    const result = await api<{ confirmed: number; pending: number }>("/api/sap-matching/run-auto", { method: "POST" });
    setMessage(`Matching terminé: ${result.confirmed} confirmé(s), ${result.pending} à vérifier.`);
    queue.reload();
  }

  async function confirm(item: SapQueueItem, sapEmpId?: string) {
    await api(`/api/sap-matching/${item.employee.id}/confirm`, {
      method: "PATCH",
      body: JSON.stringify({ sapEmpId })
    });
    setMessage("Rapprochement confirmé et matricule local mis à jour.");
    queue.reload();
  }

  async function reject(item: SapQueueItem, sapEmpId: string) {
    await api(`/api/sap-matching/${item.employee.id}/reject`, {
      method: "PATCH",
      body: JSON.stringify({ sapEmpId })
    });
    setMessage("Suggestion rejetée.");
    queue.reload();
  }

  async function manual(item: SapQueueItem) {
    const sapEmpId = selectedSapByEmployee[item.employee.id];
    if (!sapEmpId) return;
    await api(`/api/sap-matching/${item.employee.id}/manual`, {
      method: "POST",
      body: JSON.stringify({ sapEmpId })
    });
    setMessage("Rapprochement manuel confirmé et matricule local mis à jour.");
    queue.reload();
    all.reload();
  }

  async function refreshCache() {
    await api<SapDirectoryCacheStatus>("/api/sap-matching/refresh-cache", { method: "POST" });
    setMessage("Cache de l'annuaire SAP rafraîchi.");
    cacheStatus.reload();
    setManualResultsByEmployee({});
    queue.reload();
    all.reload();
  }

  async function relink(row: SapAllMappingRow) {
    const sapEmpId = selectedSapByEmployee[row.employee.id];
    if (!sapEmpId) return;
    await api(`/api/sap-matching/${row.employee.id}/relink`, {
      method: "PATCH",
      body: JSON.stringify({ sapEmpId })
    });
    setMessage("Rapprochement modifié. L'ancien mapping est rejeté et le matricule local est mis à jour.");
    queue.reload();
    all.reload();
  }

  const visibleDirectoryRows = directoryRows.data.filter(row => !directoryFilters.filters.company || row.company === directoryFilters.filters.company);

  function updateManualSearch(employee: Employee, search: string) {
    const employeeId = employee.id;
    setManualSearchByEmployee(current => ({ ...current, [employeeId]: search }));
    setSelectedSapByEmployee(current => ({ ...current, [employeeId]: "" }));

    window.clearTimeout(searchTimers.current[employeeId]);

    if (search.trim().length < 2) {
      setManualResultsByEmployee(current => ({ ...current, [employeeId]: [] }));
      setManualErrorByEmployee(current => ({ ...current, [employeeId]: null }));
      return;
    }

    searchTimers.current[employeeId] = window.setTimeout(() => {
      searchSapForEmployee(employee, search);
    }, 350);
  }

  async function searchSapForEmployee(employee: Employee, explicitSearch?: string) {
    const typedSearch = (explicitSearch ?? (manualSearchByEmployee[employee.id] || "")).trim();
    const search = sapSearchQueryForEmployee(employee, typedSearch);
    if (!search) return;

    setSearchingEmployee(employee.id);
    setManualErrorByEmployee(current => ({ ...current, [employee.id]: null }));
    try {
      const results = await api<SapEmployee[]>(`/api/sap-matching/directory?search=${encodeURIComponent(search)}`);
      setManualResultsByEmployee(current => ({ ...current, [employee.id]: results }));
      if (!results.length) {
        setManualErrorByEmployee(current => ({ ...current, [employee.id]: "Aucun résultat SAP trouvé." }));
      }
    } catch (error) {
      setManualResultsByEmployee(current => ({ ...current, [employee.id]: [] }));
      setManualErrorByEmployee(current => ({ ...current, [employee.id]: error instanceof Error ? error.message : "Erreur de recherche SAP." }));
    } finally {
      setSearchingEmployee(null);
    }
  }

  function renderManualMatch(employee: Employee, onSubmit: () => void, actionLabel: string) {
    const results = manualResultsByEmployee[employee.id] || [];
    const selected = selectedSapByEmployee[employee.id] || "";
    const search = manualSearchByEmployee[employee.id] || "";
    const error = manualErrorByEmployee[employee.id];
    const isSearching = searchingEmployee === employee.id;

    return (
      <div className="manual-match">
        <div className="input-icon">
          <Search size={15} />
          <input
            value={search}
            onChange={event => updateManualSearch(employee, event.target.value)}
            onKeyDown={event => {
              if (event.key === "Enter") {
                event.preventDefault();
                searchSapForEmployee(employee);
              }
            }}
            placeholder={`Chercher SAP: ${employee.fullName}`}
          />
        </div>
        <Button type="button" variant="secondary" disabled={isSearching} onClick={() => searchSapForEmployee(employee)}>
          <Search size={14} /> Rechercher SAP
        </Button>
        <select value={selected} onChange={event => setSelectedSapByEmployee(current => ({ ...current, [employee.id]: event.target.value }))}>
          <option value="">Choisir parmi les résultats...</option>
          {results.map(sap => <option key={sap.empID} value={sap.empID}>{extractSapCompany(sap.empID)} - {sap.empID} - {sap.sapFullName} - {sap.Poste || "-"} - {sap.mobile || "-"}</option>)}
        </select>
        <span className={error ? "inline-error" : "muted"}>{isSearching ? "Recherche SAP en cours..." : error || (results.length ? `${results.length} résultat(s)` : "Champ vide = recherche par nom BioTime.")}</span>
        <Button type="button" variant="secondary" disabled={!selected} onClick={onSubmit}>{actionLabel}</Button>
      </div>
    );
  }

  return (
    <>
      <PageHeader title="Rapprochement SAP" actions={<Button type="button" variant="primary" onClick={runAuto}><RefreshCw size={16} /> Lancer matching auto</Button>} />
      <section className="panel">
        {message && <div className="alert alert-success">{message}</div>}
        {queue.error && <div className="alert alert-error">Impossible de charger la file SAP. Vérifiez SAP HANA et les variables SAP_HANA_*.</div>}
        <div className="toolbar-row">
          <span className="muted">
            Annuaire SAP: {cacheStatus.data.loaded ? `${cacheStatus.data.employeeCount} employé(s), mis à jour ${timeAgo(cacheStatus.data.refreshedAt)}` : "non chargé"}
          </span>
          {can("users.manage") && <Button type="button" variant="secondary" onClick={refreshCache}><RefreshCw size={16} /> Rafraîchir l'annuaire SAP</Button>}
        </div>
        <div className="tabs">
          <button className={view === "queue" ? "active" : ""} onClick={() => setView("queue")}>File d'attente</button>
          <button className={view === "all" ? "active" : ""} onClick={() => setView("all")}>Tous les rapprochements</button>
          <button className={view === "directory" ? "active" : ""} onClick={() => setView("directory")}>Annuaire SAP</button>
        </div>
        {view === "queue" && <>
        <FiltersBar onReset={reset}>
          <FilterField label="Recherche employés BioTime">
            <div className="input-icon"><Search size={15} /><input value={filters.search} onChange={event => update({ search: event.target.value })} placeholder="Nom ou code BioTime" /></div>
          </FilterField>
        </FiltersBar>
        <DataTable
          rows={rows}
          empty="Aucun employé à rapprocher."
          columns={[
            { key: "bio", header: "Employé BioTime", render: row => <BioTimeCell item={row} />, sortValue: row => row.employee.fullName },
            { key: "suggestion", header: "Suggestion SAP", render: row => <SuggestionCell item={row} onConfirm={confirm} onReject={reject} /> },
            { key: "manual", header: "Recherche manuelle", render: row => renderManualMatch(row.employee, () => manual(row), "Rapprocher") }
          ]}
        />
        </>}
        {view === "all" && <>
          <FiltersBar onReset={allFilters.reset}>
            <FilterField label="Recherche">
              <div className="input-icon"><Search size={15} /><input value={allFilters.filters.search} onChange={event => allFilters.update({ search: event.target.value })} placeholder="Nom, matricule SAP, société" /></div>
            </FilterField>
            <FilterField label="Société">
              <select value={allFilters.filters.company} onChange={event => allFilters.update({ company: event.target.value })}>
                <option value="">Toutes</option>
                <option value="FABCOM">FABCOM</option>
                <option value="RECYCLAGE">RECYCLAGE</option>
                <option value="NEWTECH">NEWTECH</option>
              </select>
            </FilterField>
            <FilterField label="Statut">
              <select value={allFilters.filters.status} onChange={event => allFilters.update({ status: event.target.value })}>
                <option value="">Tous</option>
                <option value="confirmed">Confirmé</option>
                <option value="pending_review">À vérifier</option>
                <option value="rejected">Rejeté</option>
                <option value="unmapped">Non mappé</option>
              </select>
            </FilterField>
          </FiltersBar>
          <DataTable rows={all.data} empty="Aucun rapprochement trouvé." columns={[
            { key: "bio", header: "Employé BioTime", render: row => <BioTimeCell item={{ employee: row.employee, suggestions: [] }} />, sortValue: row => row.employee.fullName },
            { key: "status", header: "Statut", render: row => mappingStatusLabel(row.mappingStatus), sortValue: row => row.mappingStatus },
            { key: "company", header: "Société", render: row => row.sapCompany || "-", sortValue: row => row.sapCompany || "" },
            { key: "sap", header: "Employé SAP", render: row => row.mapping ? <div className="stack-cell"><strong>{row.mapping.sapEmpId}</strong><span>{row.mapping.sapFullName}</span><span>{row.sapPoste || "-"} · {row.sapStructure || "-"}</span></div> : <span className="muted">Non mappé</span> },
            { key: "manual", header: "Modifier le rapprochement", render: row => renderManualMatch(
              row.employee,
              () => row.mappingStatus === "confirmed" ? relink(row) : manual({ employee: row.employee, suggestions: [] }),
              row.mappingStatus === "confirmed" ? "Modifier" : "Rapprocher"
            ) }
          ]} />
        </>}
        {view === "directory" && <>
          <FiltersBar onReset={directoryFilters.reset}>
            <FilterField label="Recherche SAP brute">
              <div className="input-icon"><Search size={15} /><input value={directoryFilters.filters.search} onChange={event => directoryFilters.update({ search: event.target.value })} placeholder="728, FABCOM_DEV-728, nom, téléphone..." /></div>
            </FilterField>
            <FilterField label="Société">
              <select value={directoryFilters.filters.company} onChange={event => directoryFilters.update({ company: event.target.value })}>
                <option value="">Toutes</option>
                <option value="FABCOM">FABCOM</option>
                <option value="RECYCLAGE">RECYCLAGE</option>
                <option value="NEWTECH">NEWTECH</option>
              </select>
            </FilterField>
          </FiltersBar>
          <DataTable
            rows={visibleDirectoryRows}
            empty="Aucun employé retourné par l'annuaire SAP."
            pageSize={30}
            columns={[
              { key: "empID", header: "Matricule SAP", render: row => row.empID, sortValue: row => row.empID },
              { key: "company", header: "Société", render: row => row.company, sortValue: row => row.company },
              { key: "name", header: "Nom SAP", render: row => row.sapFullName || "-", sortValue: row => row.sapFullName },
              { key: "poste", header: "Poste", render: row => row.Poste || "-", sortValue: row => row.Poste || "" },
              { key: "structure", header: "Structure", render: row => row.Structure || "-", sortValue: row => row.Structure || "" },
              { key: "mobile", header: "Téléphone", render: row => row.mobile || "-", sortValue: row => row.mobile || "" },
              { key: "hire", header: "Entrée", render: row => row.Date_Entrer ? String(row.Date_Entrer).slice(0, 10) : "-", sortValue: row => row.Date_Entrer ? String(row.Date_Entrer) : "" }
            ]}
          />
        </>}
      </section>
    </>
  );
}

function BioTimeCell({ item }: { item: SapQueueItem }) {
  return (
    <div className="stack-cell">
      <strong>{item.employee.fullName}</strong>
      <span>BioTime ID: {item.employee.zktecoId}</span>
      <span>Code source: {item.employee.biotimeCode || item.employee.employeeCode}</span>
      <span>Tél: {item.employee.phone || "-"}</span>
    </div>
  );
}

function SuggestionCell({ item, onConfirm, onReject }: { item: SapQueueItem; onConfirm: (item: SapQueueItem, sapEmpId?: string) => void; onReject: (item: SapQueueItem, sapEmpId: string) => void }) {
  const suggestion = item.suggestions[0];
  if (!suggestion) return <span className="muted">Aucune suggestion</span>;
  const sapEmpId = suggestion.empID || item.mapping?.sapEmpId;
  return (
    <div className="stack-cell">
      <strong>{sapEmpId}</strong>
      <span>Société: {suggestion.company || (sapEmpId ? extractSapCompany(sapEmpId) : "-")}</span>
      <span>{suggestion.sapFullName || item.mapping?.sapFullName}</span>
      <span>Poste: {suggestion.Poste || item.mapping?.metadata?.Poste || "-"}</span>
      <span>Structure: {suggestion.Structure || item.mapping?.metadata?.Structure || "-"}</span>
      <span>Tél: {suggestion.mobile || item.mapping?.sapMobile || "-"}</span>
      <span>Score: {Math.round((suggestion.score || item.mapping?.confidenceScore || 0) * 100)}% · Nom {suggestion.nameMatches ? "OK" : "-"} · Tél {suggestion.phoneMatches ? "OK" : "-"}</span>
      <div className="row-actions">
        <Button type="button" variant="primary" onClick={() => onConfirm(item, sapEmpId)}><Check size={14} /> Confirmer</Button>
        {sapEmpId && <Button type="button" variant="danger" onClick={() => onReject(item, sapEmpId)}><X size={14} /> Rejeter</Button>}
      </div>
    </div>
  );
}

function mappingStatusLabel(status: SapAllMappingRow["mappingStatus"]) {
  if (status === "confirmed") return "Confirmé";
  if (status === "pending_review") return "À vérifier";
  if (status === "rejected") return "Rejeté";
  return "Non mappé";
}

function sapSearchQueryForEmployee(employee: Employee, typedSearch: string) {
  const search = typedSearch.trim();
  if (!search) return employee.fullName;
  return search;
}

function timeAgo(value: string | null) {
  if (!value) return "jamais";
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes === 1) return "il y a 1 minute";
  if (minutes < 60) return `il y a ${minutes} minutes`;
  const hours = Math.round(minutes / 60);
  return hours === 1 ? "il y a 1 heure" : `il y a ${hours} heures`;
}
