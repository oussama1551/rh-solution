import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { Device } from "../lib/types";
import { useApi } from "../lib/useApi";

export function DevicesPage() {
  const devices = useApi<Device[]>("/api/devices", []);
  return (
    <>
      <PageHeader title="Terminaux" />
      <section className="panel">
        {devices.error && <div className="alert">Endpoint terminaux prêt côté UI pour `/api/devices`.</div>}
        <DataTable rows={devices.data} columns={[
          { key: "name", header: "Nom", render: row => row.name, sortValue: row => row.name },
          { key: "ip", header: "IP", render: row => row.ipAddress || "-" },
          { key: "area", header: "Zone", render: row => row.area || "-", sortValue: row => row.area || "" },
          { key: "seen", header: "Dernière activité", render: row => row.lastSeenAt ? new Date(row.lastSeenAt).toLocaleString("fr-FR") : "-" },
          { key: "status", header: "Statut", render: row => <StatusBadge value={row.status} /> }
        ]} />
      </section>
    </>
  );
}
