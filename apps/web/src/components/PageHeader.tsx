import { ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { Link } from "react-router-dom";

export function PageHeader({ title, eyebrow = "RH Solution", actions, backTo, backLabel = "Retour" }: { title: string; eyebrow?: string; actions?: ReactNode; backTo?: string; backLabel?: string }) {
  return (
    <div className="page-header">
      <div className="page-title-row">
        {backTo && (
          <Link className="icon-button page-back-button" to={backTo} aria-label={backLabel} title={backLabel}>
            <ArrowLeft size={18} />
          </Link>
        )}
        <div>
          <div className="eyebrow">{eyebrow}</div>
          <h1>{title}</h1>
        </div>
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}
