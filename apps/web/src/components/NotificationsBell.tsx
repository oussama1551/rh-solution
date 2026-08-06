import { Bell, CheckCheck, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { NotificationList, NotificationMenuCounts } from "../lib/types";
import { useApi } from "../lib/useApi";

type Props = {
  counts: NotificationMenuCounts;
  onChanged: () => void;
};

export function NotificationsBell({ counts, onChanged }: Props) {
  const [open, setOpen] = useState(false);
  const notifications = useApi<NotificationList>(open ? "/api/notifications?limit=12" : null, { items: [], total: 0, page: 1, limit: 12 });

  useEffect(() => {
    if (!open) return;
    notifications.reload();
    const timer = window.setInterval(() => notifications.reload(), 30_000);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function markRead(id: string) {
    await api(`/api/notifications/${id}/read`, { method: "PATCH" });
    notifications.reload();
    onChanged();
  }

  async function markAllRead() {
    await api("/api/notifications/mark-all-read", { method: "POST" });
    notifications.reload();
    onChanged();
  }

  return (
    <div className="notification-bell">
      <button className="icon-button notification-button" onClick={() => setOpen(value => !value)} title="Notifications">
        <Bell size={18} />
        {counts.notifications > 0 && <span className="nav-badge bell-badge">{counts.notifications > 99 ? "99+" : counts.notifications}</span>}
      </button>
      {open && (
        <div className="notification-panel">
          <div className="notification-panel-header">
            <div>
              <strong>Notifications</strong>
              <small>{counts.notifications} non lue(s)</small>
            </div>
            <div className="row-actions">
              <button className="icon-button" onClick={markAllRead} title="Tout marquer lu"><CheckCheck size={16} /></button>
              <button className="icon-button" onClick={() => setOpen(false)} title="Fermer"><X size={16} /></button>
            </div>
          </div>
          <div className="notification-list">
            {notifications.loading && <div className="muted padded">Chargement...</div>}
            {!notifications.loading && notifications.data.items.length === 0 && <div className="muted padded">Aucune notification.</div>}
            {notifications.data.items.map(item => (
              <button key={item.id} className={`notification-item ${item.isRead ? "read" : ""}`} onClick={() => markRead(item.id)}>
                <span>{item.title}</span>
                <small>{item.message}</small>
                <em>{new Date(item.createdAt).toLocaleString("fr-FR")}</em>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
