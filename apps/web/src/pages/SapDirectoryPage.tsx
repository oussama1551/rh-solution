import { Link2, RefreshCw, Search, X } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { FilterField, FiltersBar } from "../components/FiltersBar";
import { PageHeader } from "../components/PageHeader";
import { api } from "../lib/api";
import { BiotimeDirectoryEmployee, SapDirectoryEmployee, SapDirectoryRefreshResult } from "../lib/types";
import { useApi, useSessionFilters } from "../lib/useApi";

export function SapDirectoryPage() {
  const [view, setView] = useState<"sap" | "biotime">("sap");
  const filters = useSessionFilters("sap.directory.filters", { search: "", company: "", linked: "" });
  const biotimeFilters = useSessionFilters("biotime.directory.filters", { search: "", status: "", sap: "" });
  const [message, setMessage] = useState<string | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [manualLink, setManualLink] = useState<{ sap?: SapDirectoryEmployee; employee?: BiotimeDirectoryEmployee } | null>(null);
  const params = useMemo(() => new URLSearchParams(Object.entries(filters.filters).filter(([, value]) => value)), [filters.filters]);
  const biotimeParams = useMemo(() => new URLSearchParams(Object.entries(biotimeFilters.filters).filter(([, value]) => value)), [biotimeFilters.filters]);
  const directory = useApi<SapDirectoryEmployee[]>(`/api/sap-directory?${params.toString()}`, []);
  const biotimeDirectory = useApi<BiotimeDirectoryEmployee[]>(`/api/sap-directory/biotime?${biotimeParams.toString()}`, []);
  const biotimeStats = useMemo(() => {
    const rows = biotimeDirectory.data;
    return {
      total: rows.length,
      active: rows.filter(row => row.status === "ACTIVE").length,
      resigned: rows.filter(row => row.status === "RESIGNED").length,
      linkedSap: rows.filter(row => row.sapRecords.length > 0).length,
      missingSap: rows.filter(row => row.sapRecords.length === 0).length
    };
  }, [biotimeDirectory.data]);

  async function refresh() {
    setSyncing(true);
    setSyncError(null);
    setMessage("Synchronisation BioTime + SAP lancée...");
    console.log("Synchronisation BioTime + SAP: click reçu");

    try {
      const result = await api<SapDirectoryRefreshResult>("/api/sap-directory/refresh", { method: "POST" });
      const bio = result.biotimeSync;
      const bioText = bio
        ? `BioTime: ${bio.employeesCount} employé(s), ${bio.resignsCount} démission(s), ${bio.metadata?.reactivatedCount || 0} réactivé(s), ${bio.metadata?.missingBiotimeArchivedCount || 0} archivé(s) car absents de BioTime. `
        : "";
      setMessage(`${bioText}SAP: ${result.total} employé(s), ${result.linked} lié(s), ${result.unlinked} sans BioTime.`);
      directory.reload();
      biotimeDirectory.reload();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Synchronisation impossible.";
      setSyncError(text);
      setMessage(null);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <>
      <PageHeader title="Annuaire SAP" actions={<Button type="button" variant="primary" onClick={refresh} disabled={syncing}><RefreshCw size={16} /> {syncing ? "Synchronisation..." : "Synchroniser BioTime + SAP"}</Button>} />
      <section className="panel">
        {message && <div className="alert alert-success">{message}</div>}
        {syncError && <div className="alert alert-error">Synchronisation échouée: {syncError}</div>}
        {directory.error && <div className="alert alert-error">Impossible de charger l'annuaire SAP local. Lancez une synchronisation SAP.</div>}
        <div className="toolbar-row">
          <span className="muted">Synchronise les employés/réintégrations BioTime puis recalcule les liens SAP.</span>
        </div>
        <div className="kpi-grid">
          <div className="kpi-card">
            <span>Employés BioTime</span>
            <strong>{biotimeStats.total}</strong>
          </div>
          <div className="kpi-card">
            <span>Actifs BioTime</span>
            <strong>{biotimeStats.active}</strong>
          </div>
          <div className="kpi-card">
            <span>Démissionnés BioTime</span>
            <strong>{biotimeStats.resigned}</strong>
          </div>
          <div className="kpi-card">
            <span>Liés SAP</span>
            <strong>{biotimeStats.linkedSap}</strong>
          </div>
          <div className="kpi-card">
            <span>Absents SAP</span>
            <strong>{biotimeStats.missingSap}</strong>
          </div>
        </div>
        <div className="tabs">
          <button className={view === "sap" ? "active" : ""} onClick={() => setView("sap")}>Annuaire SAP</button>
          <button className={view === "biotime" ? "active" : ""} onClick={() => setView("biotime")}>Annuaire BioTime</button>
        </div>
        {view === "sap" && <>
          <FiltersBar onReset={filters.reset}>
            <FilterField label="Recherche">
              <div className="input-icon"><Search size={15} /><input value={filters.filters.search} onChange={event => filters.update({ search: event.target.value })} placeholder="728, FABCOM-728, nom, téléphone..." /></div>
            </FilterField>
            <FilterField label="Société">
              <select value={filters.filters.company} onChange={event => filters.update({ company: event.target.value })}>
                <option value="">Toutes</option>
                <option value="FABCOM">FABCOM</option>
                <option value="RECYCLAGE">RECYCLAGE</option>
                <option value="NEWTECH">NEWTECH</option>
              </select>
            </FilterField>
            <FilterField label="Lien BioTime">
              <select value={filters.filters.linked} onChange={event => filters.update({ linked: event.target.value })}>
                <option value="">Tous</option>
                <option value="linked">Liés</option>
                <option value="unlinked">Sans lien</option>
              </select>
            </FilterField>
          </FiltersBar>
          <DataTable
            rows={directory.data}
            empty="Aucun employé SAP local trouvé."
            pageSize={30}
            columns={[
              { key: "sap", header: "SAP", render: row => <SapCell row={row} />, sortValue: row => row.sapEmpId },
              { key: "biotime", header: "BioTime", render: row => <SapBiotimeCell row={row} />, sortValue: row => row.biotimeId || "" },
              { key: "name", header: "Nom SAP", render: row => row.fullName || "-", sortValue: row => row.fullName },
              { key: "poste", header: "Poste", render: row => row.poste || "-", sortValue: row => row.poste || "" },
              { key: "structure", header: "Structure", render: row => row.structure || "-", sortValue: row => row.structure || "" },
              { key: "mobile", header: "Téléphone", render: row => row.mobile || "-", sortValue: row => row.mobile || "" },
              { key: "sync", header: "Dernière sync", render: row => new Date(row.lastSyncedAt).toLocaleString(), sortValue: row => row.lastSyncedAt },
              { key: "link", header: "Lien", render: row => (
                <Button variant="ghost" onClick={() => setManualLink({ sap: row })}>
                  <Link2 size={15} /> {row.employee ? "Modifier" : "ربط"}
                </Button>
              ) }
            ]}
          />
        </>}
        {view === "biotime" && <>
          <FiltersBar onReset={biotimeFilters.reset}>
            <FilterField label="Recherche BioTime">
              <div className="input-icon"><Search size={15} /><input value={biotimeFilters.filters.search} onChange={event => biotimeFilters.update({ search: event.target.value })} placeholder="Nom ou Code BioTime..." /></div>
            </FilterField>
            <FilterField label="Statut">
              <select value={biotimeFilters.filters.status} onChange={event => biotimeFilters.update({ status: event.target.value })}>
                <option value="">Tous</option>
                <option value="ACTIVE">Actif</option>
                <option value="RESIGNED">Démissionné</option>
              </select>
            </FilterField>
            <FilterField label="SAP">
              <select value={biotimeFilters.filters.sap} onChange={event => biotimeFilters.update({ sap: event.target.value })}>
                <option value="">Tous</option>
                <option value="linked">Existe dans SAP</option>
                <option value="missing">Absent SAP</option>
              </select>
            </FilterField>
          </FiltersBar>
          <DataTable
            rows={biotimeDirectory.data}
            empty="Aucun employé BioTime local trouvé."
            pageSize={30}
            columns={[
              { key: "bio", header: "BioTime", render: row => <LocalBiotimeCell row={row} />, sortValue: row => displayBiotimeCode(row) },
              { key: "status", header: "Statut", render: row => row.status === "ACTIVE" ? "Actif" : "Démissionné", sortValue: row => row.status },
              { key: "name", header: "Nom BioTime", render: row => row.fullName, sortValue: row => row.fullName },
              { key: "department", header: "Département", render: row => row.department || "-", sortValue: row => row.department || "" },
              { key: "sap", header: "SAP", render: row => <LocalSapCell row={row} />, sortValue: row => row.sapRecords[0]?.sapEmpId || "" },
              { key: "phone", header: "Téléphone", render: row => row.phone || "-", sortValue: row => row.phone || "" },
              { key: "link", header: "Lien", render: row => (
                <Button variant="ghost" onClick={() => setManualLink({ employee: row })}>
                  <Link2 size={15} /> {row.sapRecords.length ? "Modifier" : "ربط"}
                </Button>
              ) }
            ]}
          />
        </>}
      </section>
      {manualLink && (
        <ManualLinkModal
          initialSap={manualLink.sap}
          initialEmployee={manualLink.employee}
          onClose={() => setManualLink(null)}
          onLinked={async result => {
            setMessage(`Lien manuel enregistré: ${displaySapCode(result.sapEmpId)} ↔ ${result.employee?.fullName || "BioTime"}.`);
            setManualLink(null);
            await Promise.all([directory.reload(), biotimeDirectory.reload()]);
          }}
        />
      )}
    </>
  );
}

function ManualLinkModal({
  initialSap,
  initialEmployee,
  onClose,
  onLinked
}: {
  initialSap?: SapDirectoryEmployee;
  initialEmployee?: BiotimeDirectoryEmployee;
  onClose: () => void;
  onLinked: (row: SapDirectoryEmployee) => Promise<void>;
}) {
  const [sapSearch, setSapSearch] = useState(initialSap?.fullName || initialEmployee?.fullName || "");
  const [employeeSearch, setEmployeeSearch] = useState(initialEmployee?.fullName || initialSap?.fullName || "");
  const [sapEmpId, setSapEmpId] = useState(initialSap?.sapEmpId || initialEmployee?.sapRecords[0]?.sapEmpId || "");
  const [employeeId, setEmployeeId] = useState(initialEmployee?.id || initialSap?.employee?.id || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sapParams = useMemo(() => {
    const value = new URLSearchParams();
    if (sapSearch.trim()) value.set("search", sapSearch.trim());
    return value;
  }, [sapSearch]);
  const employeeParams = useMemo(() => {
    const value = new URLSearchParams();
    if (employeeSearch.trim()) value.set("search", employeeSearch.trim());
    return value;
  }, [employeeSearch]);
  const sapRows = useApi<SapDirectoryEmployee[]>(`/api/sap-directory?${sapParams.toString()}`, []);
  const employees = useApi<BiotimeDirectoryEmployee[]>(`/api/sap-directory/biotime?${employeeParams.toString()}`, []);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!sapEmpId || !employeeId) {
      setError("Choisissez un employé SAP et un employé BioTime.");
      return;
    }

    setSaving(true);
    try {
      const result = await api<SapDirectoryEmployee>("/api/sap-directory/link", {
        method: "POST",
        body: JSON.stringify({ sapEmpId, employeeId })
      });
      await onLinked(result);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Lien manuel impossible.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="app-modal" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span>Lien manuel SAP / BioTime</span>
            <strong>Choisir les deux fiches à relier</strong>
          </div>
          <button type="button" className="icon-button" onClick={onClose} title="Fermer"><X size={18} /></button>
        </div>
        {error && <div className="alert alert-error">{error}</div>}
        <div className="form-grid single">
          <label>
            SAP
            <input value={sapSearch} onChange={event => setSapSearch(event.target.value)} placeholder="Nom SAP, matricule..." />
          </label>
          <select value={sapEmpId} onChange={event => setSapEmpId(event.target.value)}>
            <option value="">Choisir SAP</option>
            {sapRows.data.map(row => (
              <option key={row.sapEmpId} value={row.sapEmpId}>
                {displaySapCode(row.sapEmpId)} - {row.fullName}{row.employee ? ` (lié à ${row.employee.fullName})` : ""}
              </option>
            ))}
          </select>
          <label>
            BioTime
            <input value={employeeSearch} onChange={event => setEmployeeSearch(event.target.value)} placeholder="Nom ou code BioTime..." />
          </label>
          <select value={employeeId} onChange={event => setEmployeeId(event.target.value)}>
            <option value="">Choisir BioTime</option>
            {employees.data.map(row => (
              <option key={row.id} value={row.id}>
                {displayBiotimeCode(row)} - {row.fullName}{row.sapRecords[0] ? ` (SAP ${displaySapCode(row.sapRecords[0].sapEmpId)})` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="modal-actions">
          <Button type="button" variant="ghost" onClick={onClose}>Annuler</Button>
          <Button type="submit" variant="primary" disabled={saving || sapRows.loading || employees.loading}>
            <Link2 size={16} /> {saving ? "Enregistrement..." : "ربط"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function SapCell({ row }: { row: SapDirectoryEmployee }) {
  return (
    <div className="stack-cell">
      <strong>{displaySapCode(row.sapEmpId)}</strong>
      <span>{row.sapCompany}</span>
    </div>
  );
}

function SapBiotimeCell({ row }: { row: SapDirectoryEmployee }) {
  const code = row.employee ? displayBiotimeCode(row.employee) : row.biotimeId || "-";
  return (
    <div className="stack-cell">
      <strong>{code}</strong>
      <span>{row.employee ? row.employee.fullName : "Non lié localement"}</span>
    </div>
  );
}

function LocalBiotimeCell({ row }: { row: BiotimeDirectoryEmployee }) {
  return (
    <div className="stack-cell">
      <strong>{displayBiotimeCode(row)}</strong>
    </div>
  );
}

function LocalSapCell({ row }: { row: BiotimeDirectoryEmployee }) {
  const sap = row.sapRecords[0];
  return sap ? (
    <div className="stack-cell">
      <strong>{displaySapCode(sap.sapEmpId)}</strong>
      <span>{sap.sapCompany} · {sap.fullName}</span>
    </div>
  ) : <span className="inline-error">Absent SAP</span>;
}

function displaySapCode(value: string) {
  return value.replace("_DEV-", "-");
}

function displayBiotimeCode(row: Pick<BiotimeDirectoryEmployee, "biotimeCode" | "employeeCode">) {
  return row.biotimeCode || row.employeeCode;
}
