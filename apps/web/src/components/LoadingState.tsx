import { Loader2 } from "lucide-react";

export function LoadingState({ label = "Chargement des données..." }: { label?: string }) {
  return (
    <div className="loading-state">
      <Loader2 size={18} className="spin" />
      <span>{label}</span>
    </div>
  );
}
