type Tone = "green" | "red" | "orange" | "blue" | "gray";

const labels: Record<string, { text: string; tone: Tone }> = {
  ACTIVE: { text: "Actif", tone: "green" },
  RESIGNED: { text: "Démissionné", tone: "gray" },
  ONLINE: { text: "En ligne", tone: "green" },
  OFFLINE: { text: "Hors-ligne", tone: "red" },
  UNKNOWN: { text: "Inconnu", tone: "gray" },
  PENDING: { text: "À valider", tone: "orange" },
  PENDING_APPROVAL: { text: "En attente de validation", tone: "orange" },
  APPROVED: { text: "Approuvé", tone: "green" },
  DRAFT: { text: "Brouillon", tone: "gray" },
  VALIDATED: { text: "Validé", tone: "green" },
  REJECTED: { text: "Rejeté", tone: "red" },
  OUT_OF_WINDOW: { text: "Hors-créneau", tone: "orange" },
  LATE: { text: "Retard", tone: "orange" },
  ON_TIME: { text: "À l'heure", tone: "green" }
  ,
  SUCCESS: { text: "Succès", tone: "green" },
  FAILED: { text: "Échec", tone: "red" },
  RUNNING: { text: "En cours", tone: "blue" }
};

export function StatusBadge({ value, label }: { value: string; label?: string }) {
  const config = labels[value] || { text: label || value, tone: "gray" as Tone };
  return <span className={`badge badge-${config.tone}`}>{label || config.text}</span>;
}
