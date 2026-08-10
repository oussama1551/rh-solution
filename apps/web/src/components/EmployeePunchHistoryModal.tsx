import { X } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "./Button";
import { DataTable } from "./DataTable";
import { FilterField, FiltersBar } from "./FiltersBar";
import { Employee, EmployeeRawPunch } from "../lib/types";
import { useApi } from "../lib/useApi";

type EmployeePunchHistoryModalProps = {
  employee: Pick<Employee, "id" | "fullName" | "employeeCode" | "localMatricule" | "biotimeCode"> | null;
  onClose: () => void;
};

export function EmployeePunchHistoryModal({ employee, onClose }: EmployeePunchHistoryModalProps) {
  const initialRange = useMemo(() => payrollRange(new Date()), []);
  const [filters, setFilters] = useState({ from: initialRange.startDate, to: initialRange.endDate, limit: "1000" });
  const params = new URLSearchParams();
  params.set("from", `${filters.from}T00:00:00`);
  params.set("to", `${filters.to}T23:59:59`);
  params.set("limit", filters.limit);
  const punches = useApi<EmployeeRawPunch[]>(employee ? `/api/employees/${employee.id}/punches?${params.toString()}` : null, []);

  if (!employee) return null;

  return (
    <div className="modal-backdrop">
      <div className="calendar-modal wide-modal">
        <div className="modal-header">
          <div>
            <span>Historique des pointages</span>
            <strong>{employee.fullName}</strong>
            <small className="muted">{employee.localMatricule || employee.biotimeCode || employee.employeeCode}</small>
          </div>
          <button className="icon-button" onClick={onClose} title="Fermer">
            <X size={18} />
          </button>
        </div>

        <FiltersBar onReset={() => setFilters({ from: initialRange.startDate, to: initialRange.endDate, limit: "1000" })}>
          <FilterField label="Du">
            <input type="date" value={filters.from} onChange={event => setFilters(current => ({ ...current, from: event.target.value }))} />
          </FilterField>
          <FilterField label="Au">
            <input type="date" value={filters.to} onChange={event => setFilters(current => ({ ...current, to: event.target.value }))} />
          </FilterField>
          <FilterField label="Limite">
            <select value={filters.limit} onChange={event => setFilters(current => ({ ...current, limit: event.target.value }))}>
              <option value="200">200</option>
              <option value="1000">1000</option>
              <option value="2000">2000</option>
              <option value="5000">5000</option>
            </select>
          </FilterField>
        </FiltersBar>

        <DataTable
          rows={punches.data}
          loading={punches.loading}
          loadingLabel="Chargement des pointages bruts..."
          empty="Aucun pointage brut trouvé pour cette période."
          pageSize={20}
          columns={[
            { key: "date", header: "Date", render: row => formatDate(row.punchDate), sortValue: row => row.punchTime },
            { key: "hour", header: "Heure exacte", render: row => row.punchHour, sortValue: row => row.punchTime },
            { key: "direction", header: "Type", render: row => directionLabel(row.direction), sortValue: row => row.direction },
            { key: "terminal", header: "Terminal", render: row => row.sourceDevice || "-", sortValue: row => row.sourceDevice || "" },
            { key: "verify", header: "Vérification", render: row => row.verifyMode || "-", sortValue: row => row.verifyMode || "" },
            { key: "ids", header: "ID pointage", render: row => <div className="table-main-cell"><strong>{row.biotimeId || row.zktecoPunchId || "-"}</strong><span>{row.sourceUploadedAt ? `Upload ${formatDateTime(row.sourceUploadedAt)}` : "Upload -"}</span></div> },
            { key: "shift", header: "Shift lié", render: row => row.shift ? `${row.shift.name} (${row.shift.startTime}-${row.shift.endTime})` : "-", sortValue: row => row.shift?.name || "" }
          ]}
        />

        <div className="modal-actions">
          <Button variant="secondary" onClick={onClose}>Fermer</Button>
        </div>
      </div>
    </div>
  );
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function payrollRange(reference: Date) {
  const start = new Date(reference);
  if (reference.getDate() >= 26) {
    start.setDate(26);
  } else {
    start.setMonth(start.getMonth() - 1, 26);
  }
  const end = new Date(start);
  end.setMonth(end.getMonth() + 1, 25);
  return { startDate: dateKey(start), endDate: dateKey(end) };
}

function formatDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) return value;
  const [, year, month, day] = match;
  return `${day}/${month}/${year}`;
}

function formatDateTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("fr-FR");
}

function directionLabel(value: string) {
  if (value === "CHECK_IN") return "Entrée";
  if (value === "CHECK_OUT") return "Sortie";
  return "Inconnu";
}
