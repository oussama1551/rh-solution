import { LucideIcon } from "lucide-react";

export function KpiCard({ label, value, icon: Icon, tone = "teal" }: { label: string; value: string | number; icon: LucideIcon; tone?: string }) {
  return (
    <div className="kpi-card">
      <div className={`kpi-icon kpi-${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <div className="kpi-label">{label}</div>
        <div className="kpi-value">{value}</div>
      </div>
    </div>
  );
}
