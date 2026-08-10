import {
  Activity,
  CalendarDays,
  CalendarX,
  Clock,
  CalendarPlus,
  ShieldCheck,
  ClipboardCheck,
  BarChart3,
  Network,
  LayoutDashboard,
  LogOut,
  MessageSquare,
  Monitor,
  Settings,
  RefreshCw,
  Users
} from "lucide-react";
import { useEffect } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { NotificationMenuCounts, Permission, SyncState } from "../lib/types";
import { useApi } from "../lib/useApi";
import { NotificationsBell } from "./NotificationsBell";
import { StatusBadge } from "./StatusBadge";

const navItems: Array<{ label: string; to: string; icon: typeof LayoutDashboard; permission: Permission; roles?: string[] }> = [
  { label: "Tableau de bord", to: "/", icon: LayoutDashboard, permission: "reports.read" },
  { label: "Temps réel", to: "/realtime", icon: Activity, permission: "attendance.read" },
  { label: "Absences", to: "/absences", icon: CalendarX, permission: "reports.read" },
  { label: "Absences non confirmées", to: "/presumed-absences", icon: CalendarX, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH"] },
  { label: "Employés", to: "/employees", icon: Users, permission: "employees.read" },
  { label: "Démissionnés", to: "/employees/resigned", icon: Users, permission: "employees.read", roles: ["ADMIN", "DRH", "GRH"] },
  { label: "Heures sup.", to: "/overtime", icon: Clock, permission: "attendance.read", roles: ["ADMIN", "DRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"] },
  { label: "Maladie", to: "/sick-leaves", icon: CalendarPlus, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH"] },
  { label: "Congé", to: "/leaves", icon: CalendarDays, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"] },
  { label: "Validation RH", to: "/validation", icon: ClipboardCheck, permission: "attendance.manage" },
  { label: "Messages", to: "/messages", icon: MessageSquare, permission: "reports.read" },
  { label: "Organigramme", to: "/org", icon: Network, permission: "org.read" },
  { label: "Terminaux", to: "/devices", icon: Monitor, permission: "devices.read" },
  { label: "Rapports", to: "/reports", icon: BarChart3, permission: "reports.read" },
  { label: "Synthèse paie", to: "/reports/summary", icon: BarChart3, permission: "reports.read" },
  { label: "Traitement avance", to: "/advanced-treatment", icon: ClipboardCheck, permission: "reports.read", roles: ["ADMIN", "DRH", "GRH"] },
  { label: "Contrôle paie", to: "/admin/payroll-control", icon: ShieldCheck, permission: "payroll.control" },
  { label: "Synchronisation", to: "/admin/sync", icon: RefreshCw, permission: "sync.run" },
  { label: "Annuaire SAP", to: "/admin/sap-directory", icon: Users, permission: "employees.manage" },
  { label: "Administration", to: "/admin/users", icon: Settings, permission: "administration.read" }
];

export function AppShell() {
  const { user, logout, can } = useAuth();
  const sync = useApi<SyncState>("/api/sync/state", { connected: false, lastSuccessAt: null, lastAttemptAt: null, running: false, lastError: null });
  const counts = useApi<NotificationMenuCounts>("/api/notifications/menu-counts", { notifications: 0, validation: 0, messages: 0 });
  const visibleNav = navItems.filter(item => can(item.permission) && (!item.roles || item.roles.some(role => user?.roles.includes(role))));
  const syncAge = sync.data.lastSuccessAt ? relativeTime(sync.data.lastSuccessAt) : "jamais";

  useEffect(() => {
    const timer = window.setInterval(() => {
      sync.reload();
      counts.reload();
    }, 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">RH</div>
          <div>
            <strong>RH Solution</strong>
            <span>Administration locale</span>
          </div>
        </div>
        <div className="sync-card">
          <span>Synchronisation BioTime</span>
          <StatusBadge value={sync.data.running ? "PENDING" : sync.data.connected ? "ONLINE" : "OFFLINE"} label={sync.data.running ? "Sync en cours" : sync.data.connected ? "Connecté" : "Déconnecté"} />
          <small>Dernière synchro: {syncAge}. L'application utilise la base locale.</small>
        </div>
        <nav>
          {visibleNav.map(item => {
            const Icon = item.icon;
            return (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => `nav-link ${isActive ? "active" : ""}`}>
                <Icon size={17} />
                <span>{item.label}</span>
                {navBadge(item.to, counts.data) > 0 && <span className="nav-badge">{navBadge(item.to, counts.data)}</span>}
              </NavLink>
            );
          })}
        </nav>
      </aside>
      <main className="main">
        <header className="topbar">
          <div className="server-state">
            <span className="dot dot-green" />
            API RH connectée
            <span className="separator" />
            <span className="dot dot-teal" />
            {sync.data.running ? "Sync BioTime en cours" : sync.data.connected ? "BioTime synchronisé" : "BioTime à synchroniser"}
          </div>
          <div className="user-menu">
            <NotificationsBell counts={counts.data} onChanged={counts.reload} />
            <div>
              <strong>{user?.fullName || user?.username}</strong>
            </div>
            <button className="icon-button" onClick={logout} title="Déconnexion">
              <LogOut size={18} />
            </button>
          </div>
        </header>
        <section className="content">
          <Outlet />
        </section>
      </main>
    </div>
  );
}

function navBadge(to: string, counts: NotificationMenuCounts) {
  if (to === "/validation") return counts.validation;
  if (to === "/messages") return counts.messages;
  return 0;
}

function relativeTime(value: string) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60_000));
  if (minutes < 1) return "à l'instant";
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  return `il y a ${hours} h`;
}
