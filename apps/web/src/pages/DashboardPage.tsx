import { Activity, AlertTriangle, BarChart3, CalendarClock, Clock3, MonitorOff, Percent, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { CSSProperties } from "react";
import { DataTable } from "../components/DataTable";
import { PageHeader } from "../components/PageHeader";
import { StatusBadge } from "../components/StatusBadge";
import { DashboardKpis } from "../lib/types";
import { useApi } from "../lib/useApi";

const fallbackDashboard: DashboardKpis = {
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
  absenceAlerts: [],
  employeeStatus: [],
  employeesByUnit: [],
  employeesByDepartment: [],
  deviceStatus: [],
  absenceByUnitToday: [],
  attendanceTrend: [],
  riskSnapshot: { pendingPlanning: 0, pendingFlags: 0, offlineDevices: 0, absencesToday: 0 }
};

export function DashboardPage() {
  const dashboard = useApi<DashboardKpis>("/api/reports/dashboard", fallbackDashboard);
  const data = dashboard.data;
  const totalRisks = data.riskSnapshot.pendingPlanning + data.riskSnapshot.pendingFlags + data.riskSnapshot.offlineDevices + data.riskSnapshot.absencesToday;

  return (
    <>
      <PageHeader title="Tableau de bord" />

      <section className="dashboard-hero">
        <div>
          <span>RH Solution</span>
          <h1>Vue opérationnelle globale</h1>
          <p>Présence, absences, planning, terminaux et effectifs en un seul écran de pilotage.</p>
        </div>
        <div className="dashboard-hero-meter" style={{ "--rate": `${Math.min(100, Math.max(0, data.presenceRate)) * 3.6}deg` } as CSSProperties}>
          <strong>{data.presenceRate}%</strong>
          <span>Présence mois</span>
        </div>
      </section>

      <div className="dashboard-stat-grid">
        <StatCard label="Employés actifs" value={data.activeEmployeeCount} detail={`${data.employeeCount} total`} icon={Users} tone="teal" />
        <StatCard label="Groupes au travail" value={data.workingGroupsToday} detail="Aujourd'hui" icon={UserCheck} tone="green" />
        <StatCard label="Absents aujourd'hui" value={data.absencesToday} detail={`${data.monthlyAbsences} absences ce mois`} icon={AlertTriangle} tone="red" />
        <StatCard label="Retards ce mois" value={data.lateCountThisMonth} detail="Pointages en retard" icon={Clock3} tone="orange" />
        <StatCard label="À valider" value={data.pendingAttendanceFlags} detail="Hors-créneau" icon={Activity} tone="blue" />
        <StatCard label="Planning attente" value={data.pendingPlanningCount} detail="Demandes / groupes" icon={CalendarClock} tone="orange" />
        <StatCard label="Terminaux offline" value={data.offlineDevices} detail="Surveillance système" icon={MonitorOff} tone="red" />
        <StatCard label="Risques ouverts" value={totalRisks} detail="Actions à suivre" icon={ShieldCheck} tone={totalRisks ? "red" : "green"} />
      </div>

      <div className="dashboard-layout">
        <section className="dashboard-card dashboard-card-wide">
          <SectionTitle icon={BarChart3} title="Tendance présence" subtitle="7 derniers jours visibles dans la période" />
          <div className="trend-chart">
            {data.attendanceTrend.map(day => <div className="trend-column" key={day.date}>
              <div className="trend-stack" title={`${day.presenceRate}% présence`}>
                <span className="trend-present" style={{ height: `${Math.max(4, day.presenceRate)}%` }} />
                <span className="trend-absent" style={{ height: `${Math.max(3, Math.min(100, day.absent + day.incomplete))}%` }} />
              </div>
              <strong>{day.presenceRate}%</strong>
              <small>{day.label}</small>
            </div>)}
          </div>
        </section>

        <section className="dashboard-card">
          <SectionTitle icon={Percent} title="Effectif" subtitle="Statut employés" />
          <Donut total={data.employeeCount} items={data.employeeStatus} />
        </section>

        <section className="dashboard-card">
          <SectionTitle icon={MonitorOff} title="Terminaux" subtitle="État BioTime" />
          <StatusList items={data.deviceStatus} />
        </section>

        <section className="dashboard-card">
          <SectionTitle icon={Users} title="Sociétés" subtitle="Répartition des actifs" />
          <DistributionBars items={data.employeesByUnit} />
        </section>

        <section className="dashboard-card">
          <SectionTitle icon={Users} title="Départements" subtitle="Top structures" />
          <DistributionBars items={data.employeesByDepartment} />
        </section>

        <section className="dashboard-card dashboard-card-wide">
          <SectionTitle icon={AlertTriangle} title="Absence par unité aujourd'hui" subtitle="Taux calculé sur les employés planifiés" />
          <div className="absence-unit-grid">
            {data.absenceByUnitToday.length ? data.absenceByUnitToday.map(item => (
              <div className="absence-unit-card" key={item.label}>
                <div><strong>{item.label}</strong><span>{item.absent}/{item.planned} absent(s)</span></div>
                <div className="thin-progress"><i style={{ width: `${Math.min(100, item.rate)}%` }} /></div>
                <b>{item.rate}%</b>
              </div>
            )) : <div className="empty-state">Aucune absence planifiée aujourd'hui.</div>}
          </div>
        </section>

        <section className="dashboard-card dashboard-card-wide">
          <SectionTitle icon={UserCheck} title="Groupes actifs aujourd'hui" subtitle={`${data.workingGroups.length} groupe(s)`} />
          <div className="dashboard-group-strip modern">
            {data.workingGroups.length === 0 ? <div className="empty-state">Aucun groupe planifié pour aujourd'hui.</div> : data.workingGroups.map(group => (
              <div key={group.id} className="dashboard-group-card">
                <strong>{group.name}</strong>
                <span>{group.employeeCount} employé(s)</span>
                <small>{group.shiftLabels.join(", ")}</small>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section className="panel dashboard-alert-panel">
        <div className="panel-header">
          <div><h2>Alertes absence aujourd'hui</h2><span className="muted">Les 10 premiers cas à traiter</span></div>
          {dashboard.error && <span className="muted">Données indisponibles</span>}
        </div>
        <DataTable
          rows={data.absenceAlerts}
          loading={dashboard.loading}
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

function StatCard({ label, value, detail, icon: Icon, tone }: { label:string; value:string|number; detail:string; icon:typeof Users; tone:string }) {
  return <div className={`dashboard-stat dashboard-stat-${tone}`}><div><span>{label}</span><strong>{value}</strong><small>{detail}</small></div><Icon size={20}/></div>;
}

function SectionTitle({ icon: Icon, title, subtitle }: { icon:typeof Users; title:string; subtitle:string }) {
  return <div className="dashboard-section-title"><Icon size={16}/><div><strong>{title}</strong><span>{subtitle}</span></div></div>;
}

function DistributionBars({ items }: { items:Array<{label:string;value:number}> }) {
  const max = Math.max(1, ...items.map(item => item.value));
  return <div className="distribution-bars">{items.length ? items.map(item => <div key={item.label} className="distribution-row"><div><span>{item.label}</span><b>{item.value}</b></div><i><em style={{ width: `${(item.value / max) * 100}%` }}/></i></div>) : <div className="empty-state">Aucune donnée.</div>}</div>;
}

function StatusList({ items }: { items:Array<{label:string;value:number;tone:string}> }) {
  return <div className="status-list">{items.map(item => <div key={item.label} className={`status-pill status-${item.tone}`}><span>{item.label}</span><strong>{item.value}</strong></div>)}</div>;
}

function Donut({ total, items }: { total:number; items:Array<{label:string;value:number;tone:string}> }) {
  const active = items[0]?.value || 0;
  const rate = total ? Math.round((active / total) * 100) : 0;
  return <div className="mini-donut-wrap"><div className="mini-donut" style={{ "--rate": `${rate * 3.6}deg` } as CSSProperties}><strong>{rate}%</strong></div><StatusList items={items}/></div>;
}
