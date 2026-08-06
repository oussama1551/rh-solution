import { ReactNode } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "./Button";

export function FiltersBar({ children, onReset }: { children: ReactNode; onReset: () => void }) {
  return (
    <div className="filters-bar">
      {children}
      <Button variant="secondary" onClick={onReset}>
        <RotateCcw size={16} /> Réinitialiser
      </Button>
    </div>
  );
}

export function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="filter-field">
      <span>{label}</span>
      {children}
    </label>
  );
}
