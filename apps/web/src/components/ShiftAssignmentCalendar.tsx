import { ChevronLeft, ChevronRight, Save, Trash2, Undo2 } from "lucide-react";
import { DragEvent, MouseEvent, useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { shiftLabels } from "../lib/shiftLabels";
import { ApprovalStatus, ShiftPlanningState, ShiftType } from "../lib/types";
import { useApi } from "../lib/useApi";
import { ApprovalStatusBadge } from "./ApprovalStatusBadge";
import { Button } from "./Button";

type DraftValue = ShiftType | null;
type OriginalValue = DraftValue | "MIXED";
type Target = { employeeId: string; groupId?: never } | { groupId: string; employeeId?: never };

const palette: Array<{ type: ShiftType | "CLEAR"; label: string }> = [
  { type: "MORNING", label: shiftLabels.MORNING },
  { type: "EVENING", label: shiftLabels.EVENING },
  { type: "NIGHT", label: shiftLabels.NIGHT },
  { type: "FLEXIBLE", label: shiftLabels.FLEXIBLE },
  { type: "REPOS", label: shiftLabels.REPOS },
  { type: "CLEAR", label: "Effacer" }
];

export function ShiftAssignmentCalendar({ target, title, onSaved, readOnly = false }: { target: Target; title?: string; onSaved?: () => void; readOnly?: boolean }) {
  const [period, setPeriod] = useState("");
  const [draft, setDraft] = useState<Record<string, DraftValue>>({});
  const [selectedDates, setSelectedDates] = useState<string[]>([]);
  const [lastClicked, setLastClicked] = useState<string | null>(null);
  const [activeTool, setActiveTool] = useState<ShiftType | "CLEAR" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const queryTarget = "employeeId" in target ? `employeeId=${target.employeeId}` : `groupId=${target.groupId}`;
  const state = useApi<ShiftPlanningState>(`/api/attendance/shift-planning?${queryTarget}${period ? `&period=${period}` : ""}`, null as never);

  const originalByDate = useMemo(() => {
    const map = new Map<string, OriginalValue>();
    state.data?.days?.forEach(day => map.set(day.date, day.state === "mixed" ? "MIXED" : day.shiftType));
    return map;
  }, [state.data]);
  const days = state.data?.period.days || [];
  const changedEntries = useMemo(() => Object.entries(draft).filter(([date, value]) => originalByDate.get(date) !== value), [draft, originalByDate]);

  useEffect(() => {
    setDraft({});
    setSelectedDates([]);
    setActiveTool(null);
    setMessage(null);
    setErrorMessage(null);
  }, [state.data?.period.key]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (!readOnly && (event.key === "Delete" || event.key === "Backspace") && selectedDates.length > 0) {
        event.preventDefault();
        applyShift(null, selectedDates);
      }
    }

    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [readOnly, selectedDates]);

  function changePeriod(delta: number) {
    const key = period || state.data?.period.key;
    if (!key) return;
    const [year, month] = key.split("-").map(Number);
    const next = new Date(year, month - 1 + delta, 1);
    setPeriod(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}`);
  }

  function dateRange(from: string, to: string) {
    const fromIndex = days.indexOf(from);
    const toIndex = days.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) return [to];
    const [start, end] = fromIndex < toIndex ? [fromIndex, toIndex] : [toIndex, fromIndex];
    return days.slice(start, end + 1);
  }

  function selectDate(date: string, event: MouseEvent<HTMLButtonElement>) {
    if (readOnly) return;
    if (activeTool && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      const value = activeTool === "CLEAR" ? null : activeTool;
      applyShift(value, [date]);
      setSelectedDates([date]);
      setLastClicked(date);
      return;
    }
    if (event.shiftKey && lastClicked) {
      setSelectedDates(dateRange(lastClicked, date));
    } else if (event.ctrlKey || event.metaKey) {
      setSelectedDates(current => current.includes(date) ? current.filter(item => item !== date) : [...current, date]);
      setLastClicked(date);
    } else {
      setSelectedDates([date]);
      setLastClicked(date);
    }
  }

  function applyShift(shiftType: DraftValue, targetDates = selectedDates) {
    if (readOnly) return;
    const datesToApply = targetDates.length ? targetDates : [];
    if (!datesToApply.length) return;
    setDraft(current => {
      const next = { ...current };
      datesToApply.forEach(date => {
        next[date] = shiftType;
      });
      return next;
    });
  }

  function handleDrop(event: DragEvent<HTMLButtonElement>, date: string) {
    event.preventDefault();
    if (readOnly) return;
    const raw = event.dataTransfer.getData("text/plain");
    const value = raw === "CLEAR" ? null : raw as ShiftType;
    const targets = selectedDates.includes(date) ? selectedDates : [date];
    applyShift(value, targets);
  }

  function selectWeekends() {
    if (readOnly) return;
    setSelectedDates(days.filter(date => {
      const day = new Date(`${date}T00:00:00`).getDay();
      return day === 0 || day === 6;
    }));
  }

  function selectAllDays() {
    if (readOnly) return;
    setSelectedDates(days);
  }

  function clearPeriod() {
    if (readOnly) return;
    applyShift(null, days);
    setSelectedDates(days);
  }

  async function save() {
    if (!changedEntries.length) return;
    // Guard: refuse to send if the target id is missing. This is the most common cause of
    // the "calendar resets, nothing saved" bug — a payload with no usable employeeId/groupId
    // leads the backend to a 0-row write that still returns 200.
    const hasTarget = "employeeId" in target ? Boolean(target.employeeId) : Boolean(target.groupId);
    if (!hasTarget) {
      setErrorMessage("Cible invalide (employé ou groupe manquant) — rechargez la page et réessayez.");
      return;
    }
    const entriesToSave = changedEntries.map(([date, shiftType]) => ({ date, shiftType }));
    setSaving(true);
    setMessage(null);
    setErrorMessage(null);
    try {
      const result = await api<{ employeeCount: number; dayCount: number; upsertedCount: number; removedCount: number; assignmentCount: number; status: ApprovalStatus }>("/api/attendance/shift-assignments/batch", {
        method: "POST",
        body: JSON.stringify({
          ...target,
          entries: entriesToSave
        })
      });
      // Defensive: a real save must either upsert or remove at least one row.
      // A pure-clear batch legitimately has assignmentCount===0 (it only removes),
      // so check both counters rather than just assignmentCount.
      const totalAffected = (result.upsertedCount ?? result.assignmentCount ?? 0) + (result.removedCount ?? 0);
      if (!totalAffected) {
        throw new Error("Le serveur n'a modifié aucune affectation (0 ligne). Vérifiez que l'employé/groupe existe.");
      }
      await state.reload();
      const summary = result.removedCount
        ? `${result.dayCount} jour(s) — ${result.upsertedCount ?? 0} modifié(s), ${result.removedCount} effacé(s).`
        : `${result.dayCount} jour(s), ${result.employeeCount} employé(s).`;
      setMessage(result.status === "PENDING_APPROVAL"
        ? `Modifications enregistrées — en attente de validation par un administrateur ou DRH avant application. ${summary}`
        : `Enregistré et actif. ${summary}`);
      setDraft({});
      setSelectedDates([]);
      setActiveTool(null);
      onSaved?.();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Enregistrement impossible.");
    } finally {
      setSaving(false);
    }
  }

  function cancel() {
    setDraft({});
    setSelectedDates([]);
  }

  return (
    <div className="shift-calendar-planner">
      <div className="planner-header">
        <div>
          {title && <strong>{title}</strong>}
          <span>{state.data?.period.label || "Chargement de la période..."}</span>
        </div>
        <div className="row-actions">
          <Button variant="secondary" onClick={() => changePeriod(-1)}><ChevronLeft size={16} />Période précédente</Button>
          <Button variant="secondary" onClick={() => changePeriod(1)}>Période suivante<ChevronRight size={16} /></Button>
        </div>
      </div>

      {state.data?.approvalSummary && (
        <ApprovalStatusBadge
          status={state.data.approvalSummary.status}
          reviewedAt={state.data.approvalSummary.latestApprovedAt}
          reviewedBy={state.data.approvalSummary.latestApprovedBy}
          submittedAt={state.data.approvalSummary.latestPendingAt}
          submittedBy={state.data.approvalSummary.latestPendingBy}
          rejectionReason={state.data.approvalSummary.latestRejectionReason}
          pendingCount={state.data.approvalSummary.pendingCount}
          approvedCount={state.data.approvalSummary.approvedCount}
          rejectedCount={state.data.approvalSummary.rejectedCount}
        />
      )}

      {message && <div className="alert alert-success">{message}</div>}
      {errorMessage && <div className="alert alert-error">{errorMessage}</div>}

      {readOnly ? (
        <div className="alert alert-info">Lecture seule: vous pouvez consulter et imprimer ce planning, mais pas le modifier.</div>
      ) : (
        <div className="shift-palette" aria-label="Palette des shifts">
          {palette.map(item => (
            <button
              key={item.type}
              draggable
              className={`shift-token ${activeTool === item.type ? "active" : ""} ${item.type === "CLEAR" ? "shift-token-clear" : `shift-token-${item.type.toLowerCase()}`}`}
              onDragStart={event => event.dataTransfer.setData("text/plain", item.type)}
              onClick={() => setActiveTool(current => current === item.type ? null : item.type)}
            >
              {item.type === "CLEAR" && <Trash2 size={14} />}
              {item.label}
            </button>
          ))}
          <Button
            variant="secondary"
            onClick={() => activeTool && applyShift(activeTool === "CLEAR" ? null : activeTool, selectedDates)}
            disabled={!activeTool || !selectedDates.length}
          >
            Appliquer aux jours sélectionnés
          </Button>
          <Button variant="secondary" onClick={selectAllDays}>Sélectionner tous les jours</Button>
          <Button variant="secondary" onClick={selectWeekends}>Sélectionner tous les week-ends</Button>
          <Button variant="secondary" onClick={clearPeriod}><Trash2 size={14} />Effacer toute la période</Button>
          {activeTool && <span className="tool-hint">Mode actif: {activeTool === "CLEAR" ? "Effacer" : shiftLabels[activeTool]}. Cliquez sur les jours à modifier.</span>}
        </div>
      )}

      <div className="period-calendar">
        {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map(day => <div key={day} className="calendar-head">{day}</div>)}
        {buildPeriodCells(days).map(cell => {
          if (!cell.date) return <div key={cell.key} className="calendar-day calendar-empty" />;
          const day = state.data?.days.find(item => item.date === cell.date);
          const hasDraft = Object.prototype.hasOwnProperty.call(draft, cell.date);
          const value = hasDraft ? draft[cell.date] : day?.shiftType || null;
          const selected = selectedDates.includes(cell.date);
          const changed = hasDraft && originalByDate.get(cell.date) !== draft[cell.date];
          const pending = !hasDraft && day?.approvalStatus === "PENDING_APPROVAL";

          return (
            <button
              key={cell.date}
              className={`calendar-day planner-day ${selected ? "selected" : ""} ${changed || pending ? "dirty" : ""} ${value ? `calendar-${value.toLowerCase()}` : ""}`}
              onClick={event => selectDate(cell.date!, event)}
              onDragOver={event => event.preventDefault()}
              onDrop={event => handleDrop(event, cell.date!)}
              type="button"
            >
              <strong>{cell.day}</strong>
              <small>{cell.month}</small>
              {value ? <span className={`shift-badge shift-badge-${value.toLowerCase()}`}>{shiftLabels[value]}</span> : <span className="muted">Non assigné</span>}
              {changed && <em>modifié</em>}
              {pending && <em>en attente</em>}
            </button>
          );
        })}
      </div>

      {!readOnly && (
        <div className="planner-footer">
          <span>{changedEntries.length} changement(s) non sauvegardé(s)</span>
          <div className="row-actions">
            <Button variant="secondary" onClick={cancel} disabled={!changedEntries.length}><Undo2 size={16} />Annuler</Button>
            <Button variant="primary" onClick={save} disabled={!changedEntries.length || saving}><Save size={16} />Enregistrer</Button>
          </div>
        </div>
      )}
    </div>
  );
}

function buildPeriodCells(days: string[]) {
  if (!days.length) return [];
  const first = new Date(`${days[0]}T00:00:00`);
  const leading = (first.getDay() + 6) % 7;
  const formatter = new Intl.DateTimeFormat("fr-FR", { month: "short" });
  return [
    ...Array.from({ length: leading }, (_, index) => ({ key: `empty-${index}`, date: null as string | null, day: "", month: "" })),
    ...days.map(date => {
      const parsed = new Date(`${date}T00:00:00`);
      return {
        key: date,
        date,
        day: String(parsed.getDate()).padStart(2, "0"),
        month: formatter.format(parsed)
      };
    })
  ];
}
