import { AlertTriangle, X } from "lucide-react";
import { FormEvent, useState } from "react";
import { api } from "../lib/api";
import { Employee } from "../lib/types";
import { Button } from "./Button";

const RESIGN_TYPES = [
  "Quitter",
  "Renvoyer",
  "Démissionner",
  "Transfert",
  "Maintien sans salaire"
];

export function EmployeeResignModal({ employee, onClose, onDone }: { employee: Employee | null; onClose: () => void; onDone: () => void }) {
  const [resignDate, setResignDate] = useState(dateKey(new Date()));
  const [resignType, setResignType] = useState(RESIGN_TYPES[0]);
  const [reason, setReason] = useState("");
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!employee) return null;

  async function submit(event: FormEvent) {
    event.preventDefault();
    const currentEmployee = employee;
    if (!currentEmployee) return;
    setError(null);
    if (!reason.trim()) {
      setError("Le motif est obligatoire.");
      return;
    }
    if (!confirming) {
      setConfirming(true);
      return;
    }

    setSaving(true);
    try {
      await api(`/api/employees/${currentEmployee.id}/resign`, {
        method: "POST",
        body: JSON.stringify({ resignDate, resignType, reason })
      });
      onDone();
      onClose();
    } catch (err) {
      setError(readableError(err, "Démission impossible."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop">
      <form className="app-modal" onSubmit={submit}>
        <div className="modal-header">
          <div>
            <span>Démissionner dans BioTime</span>
            <strong>{employee.fullName}</strong>
            <small className="muted">{employee.localMatricule || employee.biotimeCode || employee.employeeCode}</small>
          </div>
          <button className="icon-button" type="button" onClick={onClose} title="Fermer" disabled={saving}><X size={18} /></button>
        </div>

        {error && <div className="alert alert-error">{error}</div>}
        {confirming && (
          <div className="alert alert-warning">
            <AlertTriangle size={16} /> Cette action va créer une démission dans BioTime et passer l'employé en statut Démissionné dans RH Solution.
          </div>
        )}

        <div className="form-grid single">
          <label className="filter-field">
            Date de démission
            <input type="date" value={resignDate} onChange={event => { setResignDate(event.target.value); setConfirming(false); }} required />
          </label>
          <label className="filter-field">
            Type de démission
            <select value={resignType} onChange={event => { setResignType(event.target.value); setConfirming(false); }}>
              {RESIGN_TYPES.map(type => <option key={type} value={type}>{type}</option>)}
            </select>
          </label>
          <label className="filter-field">
            Raison
            <textarea value={reason} onChange={event => { setReason(event.target.value); setConfirming(false); }} placeholder="Motif obligatoire" required />
          </label>
        </div>

        <div className="modal-actions">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>Annuler</Button>
          <Button variant="danger" type="submit" disabled={saving || !reason.trim()}>
            {saving ? "Enregistrement..." : confirming ? "Confirmer la démission" : "Continuer"}
          </Button>
        </div>
      </form>
    </div>
  );
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function readableError(error: unknown, fallback: string) {
  if (!(error instanceof Error)) return fallback;
  try {
    const parsed = JSON.parse(error.message);
    return parsed.message || JSON.stringify(parsed);
  } catch {
    return error.message || fallback;
  }
}
