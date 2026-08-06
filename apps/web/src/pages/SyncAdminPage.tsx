import { RefreshCw } from "lucide-react";
import { useState } from "react";
import { Button } from "../components/Button";
import { DataTable } from "../components/DataTable";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { api } from "../lib/api";
import { SyncLog, SyncState } from "../lib/types";
import { useApi } from "../lib/useApi";

export function SyncAdminPage() {
  const state = useApi<SyncState>("/api/sync/state", { connected: false, lastSuccessAt: null, lastAttemptAt: null, running: false, lastError: null });
  const logs = useApi<SyncLog[]>("/api/sync/logs?limit=100", []);
  const [message, setMessage] = useState<string | null>(null);
  const [licenseMessage, setLicenseMessage] = useState<string | null>(null);
  const [licenseError, setLicenseError] = useState<string | null>(null);
  const [reactivatingLicense, setReactivatingLicense] = useState(false);
  const [sweepingPunches, setSweepingPunches] = useState(false);

  async function runSync() {
    setMessage(null);
    setLicenseMessage(null);
    setLicenseError(null);
    await api("/api/sync/run", { method: "POST" });
    setMessage("Synchronisation lancée.");
    state.reload();
    logs.reload();
  }

  async function reactivateLicense() {
    setMessage(null);
    setLicenseMessage(null);
    setLicenseError(null);
    setReactivatingLicense(true);
    try {
      const result = await api<{ success: boolean; message: string; activatedAt: string }>("/api/sync/reactivate-biotime-license", { method: "POST" });
      setLicenseMessage(`${result.message} (${new Date(result.activatedAt).toLocaleString("fr-FR")})`);
      state.reload();
      logs.reload();
    } catch (error) {
      setLicenseError(error instanceof Error ? error.message : String(error));
    } finally {
      setReactivatingLicense(false);
    }
  }

  async function runEmployeePunchSweep() {
    setMessage(null);
    setLicenseMessage(null);
    setLicenseError(null);
    setSweepingPunches(true);
    try {
      const result = await api<SyncLog>("/api/sync/employee-punch-sweep", { method: "POST" });
      const rows = result.metadata?.rowsCount ?? 0;
      const employees = result.metadata?.employeesWithRows ?? result.metadata?.employeesCount ?? 0;
      setMessage(`Rattrapage pointages employés terminé: ${rows} ligne(s) BioTime vérifiée(s), ${result.punchesCount} pointage(s), ${employees} employé(s) avec pointages.`);
      state.reload();
      logs.reload();
    } catch (error) {
      setLicenseError(error instanceof Error ? error.message : String(error));
    } finally {
      setSweepingPunches(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Synchronisation BioTime"
        actions={
          <>
            <Button variant="secondary" onClick={reactivateLicense} disabled={reactivatingLicense || state.data.running}>
              <RefreshCw size={16} /> Réactiver licence BioTime
            </Button>
            <Button variant="secondary" onClick={runEmployeePunchSweep} disabled={state.data.running || reactivatingLicense || sweepingPunches}>
              <RefreshCw size={16} /> Rattraper pointages employés
            </Button>
            <Button variant="primary" onClick={runSync} disabled={state.data.running || reactivatingLicense}>
              <RefreshCw size={16} /> Lancer maintenant
            </Button>
          </>
        }
      />
      <div className="kpi-grid">
        <KpiCard label="État BioTime" value={state.data.running ? "Sync" : state.data.connected ? "OK" : "Erreur"} icon={RefreshCw} tone={state.data.connected ? "teal" : "red"} />
        <KpiCard label="Dernière réussite" value={state.data.lastSuccessAt ? new Date(state.data.lastSuccessAt).toLocaleString("fr-FR") : "Jamais"} icon={RefreshCw} />
        <KpiCard label="Dernière tentative" value={state.data.lastAttemptAt ? new Date(state.data.lastAttemptAt).toLocaleString("fr-FR") : "Jamais"} icon={RefreshCw} />
        <KpiCard label="Mode runtime" value="Base locale" icon={RefreshCw} />
      </div>
      <section className="panel">
        {message && <div className="alert alert-success">{message}</div>}
        {licenseMessage && <div className="alert alert-success">{licenseMessage}</div>}
        {licenseError && <div className="alert alert-error">Réactivation licence échouée: {licenseError}</div>}
        {state.data.lastError && <div className="alert alert-error">Dernière synchronisation échouée: {state.data.lastError}</div>}
        <div className="panel-header">
          <h2>Historique des synchronisations</h2>
          <span className="muted">Les erreurs BioTime n'arrêtent pas l'application locale.</span>
        </div>
        <DataTable
          rows={logs.data}
          empty="Aucune synchronisation enregistrée."
          columns={[
            { key: "started", header: "Début", render: row => new Date(row.startedAt).toLocaleString("fr-FR"), sortValue: row => row.startedAt },
            { key: "finished", header: "Fin", render: row => row.finishedAt ? new Date(row.finishedAt).toLocaleString("fr-FR") : "-" },
            { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> },
            { key: "trigger", header: "Déclencheur", render: row => row.trigger },
            { key: "employees", header: "Employés", render: row => row.employeesCount, sortValue: row => row.employeesCount },
            { key: "resigns", header: "Démissions", render: row => row.resignsCount, sortValue: row => row.resignsCount },
            { key: "devices", header: "Terminaux", render: row => row.devicesCount, sortValue: row => row.devicesCount },
            { key: "punches", header: "Pointages", render: row => row.punchesCount, sortValue: row => row.punchesCount },
            { key: "sweep", header: "Rattrapage employés", render: row => row.metadata?.kind === "employee_punch_sweep" || row.metadata?.employeePunchSweepRowsCount ? `${row.metadata?.rowsCount ?? row.metadata?.employeePunchSweepRowsCount ?? 0} ligne(s)` : "-" },
            { key: "error", header: "Erreur", render: row => row.errorMessage || "-" }
          ]}
        />
      </section>
    </>
  );
}
