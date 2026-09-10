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
  Users,
  BookOpenText
  ,ScrollText
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { NotificationMenuCounts, Permission, SyncState } from "../lib/types";
import { useApi } from "../lib/useApi";
import { NotificationsBell } from "./NotificationsBell";
import { StatusBadge } from "./StatusBadge";

type NavGroup = "pilotage" | "presence" | "employees" | "payroll" | "reference" | "system";
type NavItem = { label: string; to: string; icon: typeof LayoutDashboard; permission: Permission; roles?: string[]; group: NavGroup };

const navGroups: Array<{ key: NavGroup; label: string; icon: typeof LayoutDashboard }> = [
  { key: "pilotage", label: "Pilotage", icon: LayoutDashboard },
  { key: "presence", label: "Présence", icon: CalendarDays },
  { key: "employees", label: "Employés", icon: Users },
  { key: "payroll", label: "Paie & contrôle", icon: ShieldCheck },
  { key: "reference", label: "Référentiels RH", icon: BookOpenText },
  { key: "system", label: "Administration système", icon: Settings }
];

const navItems: NavItem[] = [
  { label: "Tableau de bord", to: "/", icon: LayoutDashboard, permission: "reports.read", group: "pilotage" },
  { label: "Temps réel", to: "/realtime", icon: Activity, permission: "attendance.read", group: "pilotage" },
  { label: "Messages", to: "/messages", icon: MessageSquare, permission: "reports.read", group: "pilotage" },
  { label: "Absences", to: "/absences", icon: CalendarX, permission: "reports.read", group: "presence" },
  { label: "Absences non confirmées", to: "/presumed-absences", icon: CalendarX, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH"], group: "presence" },
  { label: "Déclaration absences", to: "/manual-absences", icon: CalendarPlus, permission: "attendance.read", roles: ["ADMIN", "DRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"], group: "presence" },
  { label: "Heures sup.", to: "/overtime", icon: Clock, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"], group: "presence" },
  { label: "Maladie", to: "/sick-leaves", icon: CalendarPlus, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH"], group: "presence" },
  { label: "Congé", to: "/leaves", icon: CalendarDays, permission: "attendance.read", roles: ["ADMIN", "DRH", "GRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"], group: "presence" },
  { label: "Validation RH", to: "/validation", icon: ClipboardCheck, permission: "attendance.manage", group: "presence" },
  { label: "Employés", to: "/employees", icon: Users, permission: "employees.read", group: "employees" },
  { label: "Démissionnés", to: "/employees/resigned", icon: Users, permission: "employees.read", roles: ["ADMIN", "DRH", "GRH"], group: "employees" },
  { label: "Organigramme", to: "/org", icon: Network, permission: "org.read", group: "employees" },
  { label: "Fiches de poste", to: "/job-descriptions", icon: BookOpenText, permission: "job_description.view", group: "employees" },
  { label: "Rapports", to: "/reports", icon: BarChart3, permission: "reports.read", group: "payroll" },
  { label: "Synthèse paie", to: "/reports/summary", icon: BarChart3, permission: "reports.read", group: "payroll" },
  { label: "Synthèse heures sup.", to: "/reports/overtime-summary", icon: Clock, permission: "reports.read", roles: ["ADMIN", "DRH", "GRH", "RESPONSABLE_DEPARTEMENT", "SUPERVISOR"], group: "payroll" },
  { label: "Traitement avance", to: "/advanced-treatment", icon: ClipboardCheck, permission: "reports.read", roles: ["ADMIN", "DRH", "GRH"], group: "payroll" },
  { label: "Contrôle paie", to: "/admin/payroll-control", icon: ShieldCheck, permission: "payroll.control", group: "payroll" },
  { label: "Annuaire SAP", to: "/admin/sap-directory", icon: Users, permission: "employees.manage", group: "reference" },
  { label: "Décisions RH", to: "/admin/resignation-decisions", icon: ScrollText, permission: "administration.read", roles: ["ADMIN"], group: "reference" },
  { label: "Tous les logs", to: "/admin/logs", icon: ScrollText, permission: "audit.read", roles: ["ADMIN"], group: "system" },
  { label: "Synchronisation", to: "/admin/sync", icon: RefreshCw, permission: "sync.run", group: "system" },
  { label: "Terminaux", to: "/devices", icon: Monitor, permission: "devices.read", group: "system" },
  { label: "Administration", to: "/admin/users", icon: Settings, permission: "administration.read", group: "system" }
];

export function AppShell() {
  const { user, logout, can } = useAuth();
  const location = useLocation();
  const [density, setDensity] = useState(() => localStorage.getItem("rh.uiDensity") || "compact");
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

  useEffect(() => {
    document.body.dataset.density = density;
    localStorage.setItem("rh.uiDensity", density);
  }, [density]);

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
          {navGroups.map(group => {
            const items = visibleNav.filter(item => item.group === group.key);
            if (!items.length) return null;
            const GroupIcon = group.icon;
            return (
              <div className="nav-group" key={group.key}>
                <div className="nav-group-title"><GroupIcon size={14} /><span>{group.label}</span></div>
                {items.map(item => <SidebarLink key={item.to} item={item} counts={counts.data} visibleNav={visibleNav} pathname={location.pathname} />)}
              </div>
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
            <label className="density-control" title="Taille d'affichage">
              <span>Affichage</span>
              <select value={density} onChange={event => setDensity(event.target.value)}>
                <option value="mini">Mini</option>
                <option value="compact">Compact</option>
                <option value="normal">Normal</option>
                <option value="large">Large</option>
              </select>
            </label>
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

function SidebarLink({ item, counts, visibleNav, pathname }: { item: NavItem; counts: NotificationMenuCounts; visibleNav: NavItem[]; pathname: string }) {
  const Icon = item.icon;
  const badge = navBadge(item.to, counts);
  const active = isNavItemActive(item, visibleNav, pathname);
  return (
    <NavLink to={item.to} className={() => `nav-link ${active ? "active" : ""}`}>
      <Icon size={17} />
      <span>{item.label}</span>
      {badge > 0 && <span className="nav-badge">{badge}</span>}
    </NavLink>
  );
}

function isNavItemActive(item: NavItem, visibleNav: NavItem[], pathname: string) {
  if (pathname === item.to) return true;
  if (!pathname.startsWith(`${item.to}/`)) return false;
  return !visibleNav.some(other => other.to !== item.to && pathnameMatches(other.to, pathname) && other.to.length > item.to.length);
}

function pathnameMatches(target: string, pathname: string) {
  return pathname === target || pathname.startsWith(`${target}/`);
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
