import { Fingerprint, ScanFace } from "lucide-react";
import { BiometricEnrollment } from "../lib/types";

export function BiometricBadges({ enrollment, compact = false }: { enrollment?: BiometricEnrollment | null; compact?: boolean }) {
  const fingerprint = Boolean(enrollment?.fingerprint);
  const face = Boolean(enrollment?.face || enrollment?.visibleLightFace);
  return (
    <div className="biometric-badges">
      <span className={`badge biometric-badge ${fingerprint ? "badge-green" : "badge-gray"}`} title={fingerprint ? "Empreinte enrôlée" : "Empreinte non enrôlée"}>
        <Fingerprint size={compact ? 13 : 14} /> {!compact && "Empreinte"}
      </span>
      <span className={`badge biometric-badge ${face ? "badge-green" : "badge-gray"}`} title={face ? "Visage enrôlé" : "Visage non enrôlé"}>
        <ScanFace size={compact ? 13 : 14} /> {!compact && "Visage"}
      </span>
    </div>
  );
}
