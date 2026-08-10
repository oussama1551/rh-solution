import { AttendanceTiming, ShiftType } from "./types";

export const shiftLabels: Record<ShiftType, string> = {
  MORNING: "Matin / صباحا",
  EVENING: "Soir / مساءا",
  NIGHT: "Nuit / ليلا",
  FLEXIBLE: "Normal / عادي",
  REPOS: "Repos / راحة",
  SEC_MORNING: "SEC Matin / أمن صباحا",
  SEC_NIGHT: "SEC Nuit / أمن ليلا"
};

export const timingLabels: Record<AttendanceTiming, string> = {
  MORNING: "Matin / صباحا",
  EVENING: "Soir / مساءا",
  NIGHT: "Nuit / ليلا",
  NORMAL: "Normal / عادي"
};

export function shiftLabel(type: ShiftType | null | undefined, fallback?: string | null) {
  if (!type) return fallback || "-";
  return fallback ? `${fallback} / ${arabicShiftLabel(type)}` : shiftLabels[type];
}

function arabicShiftLabel(type: ShiftType) {
  if (type === "MORNING") return "صباحا";
  if (type === "EVENING") return "مساءا";
  if (type === "NIGHT") return "ليلا";
  if (type === "SEC_MORNING") return "أمن صباحا";
  if (type === "SEC_NIGHT") return "أمن ليلا";
  if (type === "REPOS") return "راحة";
  return "عادي";
}
