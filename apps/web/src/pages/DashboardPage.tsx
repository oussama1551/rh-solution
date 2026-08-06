import { AlertTriangle, CalendarClock, Clock3, MonitorOff, Percent, UserCheck, Users } from "lucide-react";
import { KpiCard } from "../components/KpiCard";
import { PageHeader } from "../components/PageHeader";
import { DataTable } from "../components/DataTable";
import { StatusBadge } from "../components/StatusBadge";
import { useApi } from "../lib/useApi";
import { DashboardKpis } from "../lib/types";

export function DashboardPage() {
  const kpis = useApi<DashboardKpis>("/api/reports/dashboard", {
    presenceRate: 0,
    lateCountThisMonth: 0,
    pendingAttendanceFlags: 0,
    offlineDevices: 0,
    employeeCount: 0,
    activeEmployeeCount: 0,
    workingGroupsToday: 0,
    pendingPlanningCount: 0,
    absencesToday: 0,
    monthlyAbsences: 0,
    workingGroups: [],
    absenceAlerts: []
  });

  return (
    <>
      <PageHeader title="Tableau de bord" />
      <div className="kpi-grid">
        <KpiCard label="Mes travailleurs" value={kpis.data.employeeCount} icon={Users} />
        <KpiCard label="Groupes au travail aujourd'hui" value={kpis.data.workingGroupsToday} icon={UserCheck} />
        <KpiCard label="Plannings en attente" value={kpis.data.pendingPlanningCount} icon={CalendarClock} tone="orange" />
        <KpiCard label="Absents aujourd'hui" value={kpis.data.absencesToday} icon={AlertTriangle} tone="red" />
        <KpiCard label="Absences ce mois" value={kpis.data.monthlyAbsences} icon={Clock3} tone="orange" />
        <KpiCard label="Taux de présence" value={`${kpis.data.presenceRate}%`} icon={Percent} />
        <KpiCard label="Hors-créneau à valider" value={kpis.data.pendingAttendanceFlags} icon={AlertTriangle} tone="orange" />
        <KpiCard label="Terminaux hors-ligne" value={kpis.data.offlineDevices} icon={MonitorOff} tone="red" />
      </div>

      <section className="panel">
        <div className="panel-header">
          <h2>Groupes qui travaillent aujourd'hui</h2>
          <span className="muted">{kpis.data.workingGroups.length} groupe(s)</span>
        </div>
        <div className="dashboard-group-strip">
          {kpis.data.workingGroups.length === 0 ? (
            <div className="empty-state">Aucun groupe planifié pour aujourd'hui.</div>
          ) : kpis.data.workingGroups.map(group => (
            <div key={group.id} className="dashboard-group-card">
              <strong>{group.name}</strong>
              <span>{group.employeeCount} employé(s)</span>
              <small>{group.shiftLabels.join(", ")}</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Alertes absence aujourd'hui</h2>
          {kpis.error && <span className="muted">Données indisponibles</span>}
        </div>
        <DataTable
          rows={kpis.data.absenceAlerts}
          loading={kpis.loading}
          loadingLabel="Chargement du tableau de bord..."
          empty="Aucun absent actuellement selon le planning."
          columns={[
            { key: "employee", header: "Employé", render: row => <div className="table-main-cell"><strong>{row.employee.fullName}</strong><span>{row.employee.code}</span></div>, sortValue: row => row.employee.fullName },
            { key: "group", header: "Groupe", render: row => row.employee.groupName || "-", sortValue: row => row.employee.groupName || "" },
            { key: "department", header: "Département", render: row => row.employee.department || "-", sortValue: row => row.employee.department || "" },
            { key: "shift", header: "Planning", render: row => `${row.shift.label} ${row.shift.startTime || "--:--"}-${row.shift.endTime || "--:--"}` },
            { key: "status", header: "Statut", render: () => <StatusBadge value="REJECTED" label="Absent" /> }
          ]}
        />
      </section>
    </>
  );
}
