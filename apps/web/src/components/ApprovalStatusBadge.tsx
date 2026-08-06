import { ApprovalStatus, UserSummary } from "../lib/types";
import { StatusBadge } from "./StatusBadge";

type ApprovalStatusBadgeProps = {
  status?: ApprovalStatus | null;
  submittedAt?: string | null;
  submittedBy?: UserSummary | null;
  reviewedAt?: string | null;
  reviewedBy?: UserSummary | null;
  rejectionReason?: string | null;
  pendingCount?: number;
  approvedCount?: number;
  rejectedCount?: number;
  compact?: boolean;
};

export function ApprovalStatusBadge({
  status,
  submittedAt,
  submittedBy,
  reviewedAt,
  reviewedBy,
  rejectionReason,
  pendingCount = 0,
  approvedCount = 0,
  compact = false
}: ApprovalStatusBadgeProps) {
  const resolvedStatus = status || "DRAFT";
  const reviewer = displayUser(reviewedBy);
  const submitter = displayUser(submittedBy);
  const hasPendingModification = pendingCount > 0 && approvedCount > 0;

  return (
    <div className={`approval-status ${compact ? "approval-status-compact" : ""}`}>
      <div className="approval-status-row">
        <StatusBadge value={resolvedStatus} />
        {hasPendingModification && <StatusBadge value="PENDING_APPROVAL" label="Modifications en attente" />}
      </div>
      {!compact && (
        <div className="approval-status-details">
          {resolvedStatus === "APPROVED" && (
            <span>{reviewedAt ? `Approuvé le ${formatDateTime(reviewedAt)}${reviewer ? ` par ${reviewer}` : ""}` : "Version active utilisée par le matching."}</span>
          )}
          {resolvedStatus === "PENDING_APPROVAL" && (
            <span>{submittedAt ? `Soumis le ${formatDateTime(submittedAt)}${submitter ? ` par ${submitter}` : ""}` : "En attente de validation Admin/DRH."}</span>
          )}
          {resolvedStatus === "REJECTED" && (
            <span className="text-danger">Motif: {rejectionReason || "Non renseigné"}</span>
          )}
          {resolvedStatus === "DRAFT" && <span>Brouillon non actif.</span>}
          {hasPendingModification && <span>La version approuvée reste active tant que ces modifications ne sont pas validées.</span>}
        </div>
      )}
    </div>
  );
}

function displayUser(user?: UserSummary | null) {
  return user?.fullName || user?.username || "";
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}
